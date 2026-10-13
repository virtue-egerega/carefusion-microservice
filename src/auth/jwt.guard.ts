import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { sessionEnded, SessionsService } from './sessions.service';

const ALLOWS_PASSWORD_CHANGE_KEY = 'allows_password_change_required';

/** Marks a route usable by a token issued for a forced password change (e.g. change-password). */
export const AllowsPasswordChangeRequired = () => SetMetadata(ALLOWS_PASSWORD_CHANGE_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly sessions: SessionsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<Request>();
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw sessionEnded('TOKEN_EXPIRED');

        let payload: any;
        try {
            payload = this.jwtService.verify(token, {
                secret: process.env.JWT_ACCESS_TOKEN_SECRET,
            });
        } catch {
            throw sessionEnded('TOKEN_EXPIRED');
        }
        // Tokens issued before revocation existed carry no jti and can't be checked
        if (!payload.jti) throw sessionEnded('TOKEN_EXPIRED');

        // Logged out, or forced to log in again (09 §9.5)
        const ended = await this.sessions.endedReason(payload.jti, payload.sub);
        if (ended) throw sessionEnded(ended);

        // A user signed in with a temporary password may only change it (09 §3)
        if (payload.passwordChangeRequired) {
            const allowed = this.reflector.getAllAndOverride<boolean>(ALLOWS_PASSWORD_CHANGE_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (!allowed) throw new ForbiddenException('You must change your temporary password before continuing');
        }

        (req as any)['user'] = payload;
        return true;
    }
}
