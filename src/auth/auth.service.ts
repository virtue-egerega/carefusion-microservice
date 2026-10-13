import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { LoginDto, ChangePasswordDto } from '@shared/contracts/auth';
import { $Enums } from '../../generated/prisma/client';
import { sessionEnded, SessionsService } from './sessions.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const PASSWORD_HISTORY_LIMIT = 5;
const MAX_ATTEMPTS_LOCKOUT  = 5;
const MAX_ATTEMPTS_RESTRICT = 8;
const LOCKOUT_MINUTES       = 10;

/** What a session carries (09 §9.1). Every token adds its own jti. */
type SessionClaims = {
    sub: string;
    type: string;
    organizationId: string | null;
    branchId: string | null;
    permissions: string[];
    dutyProfileIds: string[];
};

const pickClaims = ({ sub, type, organizationId, branchId, permissions, dutyProfileIds }: SessionClaims): SessionClaims =>
    ({ sub, type, organizationId, branchId, permissions, dutyProfileIds });

@Injectable()
export class AuthService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly sessions: SessionsService,
    ) {}

    async login(dto: LoginDto) {
        const { email, password } = dto;

        const user = await this.databaseService.client.user.findUnique({
            where: { email, deletedAt: null },
            include: {
                staff: {
                    include: {
                        branch: { select: { id: true, name: true } },
                        department: {
                            include: {
                                queues: {
                                    where: { isActive: true, deletedAt: null },
                                    select: { id: true, name: true, systemKey: true },
                                    orderBy: { name: 'asc' },
                                },
                            },
                        },
                        assignments: {
                            where: {
                                OR: [
                                    { endsAt: null },
                                    { endsAt: { gt: new Date() } },
                                ],
                            },
                            include: {
                                dutyProfile: {
                                    include: {
                                        permissions: {
                                            include: { permission: { select: { key: true } } },
                                        },
                                        queues: {
                                            include: { queue: { select: { id: true, name: true, systemKey: true } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!user) throw new NotFoundException('No account found with this email');

        if (user.status === $Enums.UserStatus.RESTRICTED) {
            throw new UnauthorizedException('Your account has been restricted. Contact support.');
        }
        if (user.status === $Enums.UserStatus.NOTAPPROVED) {
            throw new UnauthorizedException('Your account is pending approval. Contact your administrator.');
        }

        // Lockout check
        const lockoutCutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);
        if (user.loginAttempts >= MAX_ATTEMPTS_LOCKOUT && user.lastLogin && user.lastLogin > lockoutCutoff) {
            throw new UnauthorizedException(
                `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
            );
        }

        const passwordValid = await bcrypt.compare(password, user.password);

        if (!passwordValid) {
            const newAttempts = user.loginAttempts + 1;
            const shouldRestrict = newAttempts > MAX_ATTEMPTS_RESTRICT;

            await this.databaseService.client.user.update({
                where: { id: user.id },
                data: {
                    loginAttempts: newAttempts,
                    lastLogin: new Date(),
                    ...(shouldRestrict && { status: $Enums.UserStatus.RESTRICTED }),
                },
            });

            if (shouldRestrict) {
                throw new UnauthorizedException('Account restricted due to too many failed login attempts. Contact support.');
            }

            throw new UnauthorizedException('Incorrect password');
        }

        const { password: _, staff, ...safeUser } = user;

        await this.databaseService.client.user.update({
            where: { id: user.id },
            data:  { loginAttempts: 0, lastLogin: new Date() },
        });
        // A successful login is what satisfies a forced re-login (09 §9.3)
        await this.sessions.clearRelogin(user.id);

        // Signed in with a temporary password: the only thing this session may do is change it.
        // No permissions, no organisation, no refresh token.
        if (user.mustChangePassword) {
            const access_token = this.jwtService.sign(
                { sub: user.id, type: user.type, passwordChangeRequired: true, jti: randomUUID() },
                {
                    secret: process.env.JWT_ACCESS_TOKEN_SECRET,
                    expiresIn: process.env.JWT_PASSWORD_CHANGE_TOKEN_EXPIRES_IN as any,
                },
            );
            return { user: safeUser, mustChangePassword: true, access_token, refresh_token: null };
        }

        // Login is the only place permissions are read (09 §9): union across active duty profiles
        const activeAssignments = user.staff?.assignments.filter(a => !a.dutyProfile.deletedAt) ?? [];
        const permissions: string[] = [...new Set(
            activeAssignments.flatMap(a => a.dutyProfile.permissions.map(p => p.permission.key)),
        )];
        const queues = [...new Map(
            activeAssignments.flatMap(a => a.dutyProfile.queues.map(q => [q.queue.id, q.queue] as const)),
        ).values()];

        const { access_token, refresh_token } = this.signSession({
            sub: user.id,
            type: user.type,
            organizationId: user.staff?.hospitalId ?? null,
            branchId: user.staff?.branchId ?? null,
            permissions,
            dutyProfileIds: activeAssignments.map(a => a.dutyProfileId),
        });

        const staffProfile = staff ? {
            role: staff.role,
            branch: staff.branch,
            department: staff.department ? {
                id: staff.department.id,
                name: staff.department.name,
                systemKey: staff.department.systemKey,
                queues: staff.department.queues,
            } : null,
            permissions,
            queues,
        } : null;

        return { user: safeUser, mustChangePassword: false, staff: staffProfile, access_token, refresh_token };
    }

    /**
     * Issues a new access token from a valid refresh token (09 §9.2). No database read: the claims
     * are copied from the refresh token, so updated permissions only ever come from a new login.
     */
    async refresh(refreshToken: string | undefined) {
        if (!refreshToken) throw sessionEnded('TOKEN_EXPIRED');

        let payload: SessionClaims & { jti: string };
        try {
            payload = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_TOKEN_SECRET });
        } catch {
            throw sessionEnded('TOKEN_EXPIRED');
        }
        if (!payload.jti) throw sessionEnded('TOKEN_EXPIRED');

        const ended = await this.sessions.endedReason(payload.jti, payload.sub);
        if (ended) throw sessionEnded(ended);

        const access_token = this.jwtService.sign(
            { ...pickClaims(payload), jti: randomUUID() },
            { secret: process.env.JWT_ACCESS_TOKEN_SECRET, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN as any },
        );
        return { access_token };
    }

    /**
     * Ends this device's session (09 §9.4): both tokens are blacklisted until they would have
     * expired. Other devices stay signed in.
     */
    async logout(access: { jti: string; exp: number }, refreshToken: string | undefined) {
        await this.sessions.revokeToken(access.jti, access.exp, 'LOGGED_OUT');

        if (refreshToken) {
            try {
                const refresh = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_TOKEN_SECRET });
                if (refresh.jti) await this.sessions.revokeToken(refresh.jti, refresh.exp, 'LOGGED_OUT');
            } catch {
                // already invalid or expired: nothing to revoke
            }
        }
        return { message: 'Logged out' };
    }

    /** Access + refresh tokens with the same claims and their own ids. */
    private signSession(claims: SessionClaims) {
        const access_token = this.jwtService.sign(
            { ...claims, jti: randomUUID() },
            { secret: process.env.JWT_ACCESS_TOKEN_SECRET, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN as any },
        );
        const refresh_token = this.jwtService.sign(
            { ...claims, jti: randomUUID() },
            { secret: process.env.JWT_REFRESH_TOKEN_SECRET, expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN as any },
        );
        return { access_token, refresh_token };
    }

    async changePassword(userId: string, dto: ChangePasswordDto) {
        const user = await this.databaseService.client.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const currentValid = await bcrypt.compare(dto.currentPassword, user.password);
        if (!currentValid) throw new UnauthorizedException('Current password is incorrect');

        await this.assertNotInHistory(userId, dto.newPassword);

        const newHash = await bcrypt.hash(dto.newPassword, 10);

        await this.databaseService.client.$transaction([
            this.databaseService.client.passwordHistory.create({
                data: { userId, password: user.password, changedBy: userId, reason: $Enums.PasswordChangeReason.USER_CHANGE },
            }),
            this.databaseService.client.user.update({
                where: { id: userId },
                data: { password: newHash, mustChangePassword: false },
            }),
        ]);

        // Every session, including this one, must log in again with the new password
        await this.sessions.requireRelogin([userId], 'PASSWORD_CHANGED');

        return { message: 'Password changed successfully. Please log in again.' };
    }

    private async assertNotInHistory(userId: string, plainPassword: string): Promise<void> {
        const history = await this.databaseService.client.passwordHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: PASSWORD_HISTORY_LIMIT,
        });

        for (const entry of history) {
            const matches = await bcrypt.compare(plainPassword, entry.password);
            if (matches) {
                throw new BadRequestException(
                    `Password was used recently. Choose one of your last ${PASSWORD_HISTORY_LIMIT} passwords.`,
                );
            }
        }
    }
}
