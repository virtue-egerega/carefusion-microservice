import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { LoginDto, ChangePasswordDto } from '@shared/contracts/auth';
import { $Enums } from '../../generated/prisma/client';
import * as bcrypt from 'bcrypt';

const PASSWORD_HISTORY_LIMIT = 5;
const MAX_ATTEMPTS_LOCKOUT  = 5;
const MAX_ATTEMPTS_RESTRICT = 8;
const LOCKOUT_MINUTES       = 10;
// A temporary-password session can only change the password (09 §3), so it is short-lived
const PASSWORD_CHANGE_TOKEN_TTL = '30m';

@Injectable()
export class AuthService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly jwtService: JwtService,
    ) {}

    async login(dto: LoginDto) {
        const { email, password } = dto;

        const user = await this.databaseService.client.user.findUnique({
            where: { email, deletedAt: null },
            include: {
                staff: {
                    include: {
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

        const { password: _, refreshToken: __, staff, ...safeUser } = user;

        // Signed in with a temporary password: the only thing this session may do is change it.
        // No permissions, no organisation, no refresh token.
        if (user.mustChangePassword) {
            const access_token = this.jwtService.sign(
                { sub: user.id, type: user.type, passwordChangeRequired: true },
                { secret: process.env.JWT_ACCESS_TOKEN_SECRET, expiresIn: PASSWORD_CHANGE_TOKEN_TTL },
            );
            await this.databaseService.client.user.update({
                where: { id: user.id },
                data:  { loginAttempts: 0, lastLogin: new Date(), refreshToken: null },
            });
            return { user: safeUser, mustChangePassword: true, access_token, refresh_token: null };
        }

        // Union of all permission keys across every active DutyProfile assignment
        const activeAssignments = user.staff?.assignments.filter(a => !a.dutyProfile.deletedAt) ?? [];
        const permissions: string[] = [...new Set(
            activeAssignments.flatMap(a => a.dutyProfile.permissions.map(p => p.permission.key)),
        )];

        // Request context carried in the token so handlers don't re-query it (see AuthUser)
        const tokenPayload = {
            sub: user.id,
            type: user.type,
            organizationId: user.staff?.hospitalId ?? null,
            permissions,
            dutyProfileIds: activeAssignments.map(a => a.dutyProfileId),
        };

        const access_token = this.jwtService.sign(tokenPayload, {
            secret: process.env.JWT_ACCESS_TOKEN_SECRET,
            expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN as any,
        });
        const refresh_token = this.jwtService.sign(tokenPayload, {
            secret: process.env.JWT_REFRESH_TOKEN_SECRET,
            expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN as any,
        });

        await this.databaseService.client.user.update({
            where: { id: user.id },
            data: {
                loginAttempts: 0,
                lastLogin: new Date(),
                refreshToken: await bcrypt.hash(refresh_token, 10),
            },
        });

        const staffProfile = staff ? {
            role: staff.role,
            department: staff.department ? {
                id: staff.department.id,
                name: staff.department.name,
                systemKey: staff.department.systemKey,
                queues: staff.department.queues,
            } : null,
            permissions,
        } : null;

        return { user: safeUser, mustChangePassword: false, staff: staffProfile, access_token, refresh_token };
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
                data: { password: newHash, refreshToken: null, mustChangePassword: false },
            }),
        ]);

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
