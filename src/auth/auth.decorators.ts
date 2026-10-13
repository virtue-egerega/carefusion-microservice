import { applyDecorators, createParamDecorator, ExecutionContext, ForbiddenException, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt.guard';
import { PERMISSIONS_KEY, PermissionsGuard } from './permissions.guard';
import type { AuthUser } from './permissions.guard';

/** Requires a valid access token and every listed permission key. */
export const Authorize = (...permissions: string[]) =>
    applyDecorators(
        SetMetadata(PERMISSIONS_KEY, permissions),
        UseGuards(JwtAuthGuard, PermissionsGuard),
        ApiBearerAuth(),
    );

/** The authenticated caller (the JWT payload, see AuthUser). */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** The caller's home branch, from the token. Where they're working: charges and patients record it. */
export const BranchId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
    const branchId = (ctx.switchToHttp().getRequest().user as AuthUser | undefined)?.branchId;
    if (!branchId) throw new ForbiddenException('Your account has no branch. Ask an administrator to assign one, then log in again');
    return branchId;
});

/** The caller's organisation, from the token. Rejects tokens without one (non-staff users). */
export const OrganizationId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
    const organizationId = (ctx.switchToHttp().getRequest().user as AuthUser | undefined)?.organizationId;
    if (!organizationId) throw new ForbiddenException('This action requires a staff account in an organisation');
    return organizationId;
});
