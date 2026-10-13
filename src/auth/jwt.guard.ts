import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

const ALLOWS_PASSWORD_CHANGE_KEY = 'allows_password_change_required';

/** Marks a route usable by a token issued for a forced password change (e.g. change-password). */
export const AllowsPasswordChangeRequired = () => SetMetadata(ALLOWS_PASSWORD_CHANGE_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new UnauthorizedException('No token provided');

        let payload: any;
        try {
            payload = this.jwtService.verify(token, {
                secret: process.env.JWT_ACCESS_TOKEN_SECRET,
            });
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }

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
