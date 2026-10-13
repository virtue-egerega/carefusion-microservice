import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';

export const PERMISSIONS_KEY = 'required_permissions';

/** The JWT payload signed at login (AuthService.login). */
export type AuthUser = {
    sub: string;
    type: string;
    organizationId: string | null;
    permissions: string[];
    dutyProfileIds: string[];
};

/**
 * Permissions checked against the DB on every use instead of the token. Access tokens live 24h;
 * someone whose approval rights were revoked must not keep approving money until it expires.
 */
const FRESH_PERMISSIONS = new Set(['finance.request.approve', 'finance.policy.manage']);

/** Requires every key declared with @Authorize(...). Must run after JwtAuthGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly databaseService: DatabaseService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) ?? [];

        const req = context.switchToHttp().getRequest();
        const user: AuthUser | undefined = req.user;
        if (!user?.sub) throw new ForbiddenException('No authenticated user');

        if (required.some(key => FRESH_PERMISSIONS.has(key))) {
            const fresh = await this.loadFromDb(user.sub);
            user.permissions = fresh.permissions;
            user.dutyProfileIds = fresh.dutyProfileIds;
        }

        const held = user.permissions ?? [];
        const missing = required.filter(key => !held.includes(key));
        if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
        return true;
    }

    private async loadFromDb(staffId: string) {
        const assignments = await this.databaseService.client.staffAssignment.findMany({
            where: {
                staffId,
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
                dutyProfile: { deletedAt: null },
            },
            select: {
                dutyProfileId: true,
                dutyProfile: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
            },
        });
        return {
            permissions: [...new Set(assignments.flatMap(a => a.dutyProfile.permissions.map(p => p.permission.key)))],
            dutyProfileIds: assignments.map(a => a.dutyProfileId),
        };
    }
}
