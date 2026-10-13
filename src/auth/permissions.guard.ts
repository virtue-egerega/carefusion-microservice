import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PERMISSIONS_KEY = 'required_permissions';

/** The JWT payload signed at login (AuthService.login). */
export type AuthUser = {
    sub: string;
    type: string;
    organizationId: string | null;
    branchId: string | null;
    permissions: string[];
    dutyProfileIds: string[];
    jti: string;
    exp: number;
};

/**
 * Requires every key declared with @Authorize(...), using the permissions in the token only — no
 * database read. Permission changes reach users by forcing a re-login (09 §9.3). Runs after
 * JwtAuthGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) ?? [];

        const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
        if (!user?.sub) throw new ForbiddenException('No authenticated user');

        const held = user.permissions ?? [];
        const missing = required.filter(key => !held.includes(key));
        if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
        return true;
    }
}
