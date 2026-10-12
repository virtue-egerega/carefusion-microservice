import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { LoginDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from '@shared/contracts/auth';
import { $Enums } from '../../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const PASSWORD_HISTORY_LIMIT = 5;
const MAX_ATTEMPTS_LOCKOUT  = 5;
const MAX_ATTEMPTS_RESTRICT = 8;
const LOCKOUT_MINUTES       = 10;
const RESET_TOKEN_HOURS     = 1;

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

        const tokenPayload = { sub: user.id, type: user.type };

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

        const { password: _, refreshToken: __, staff, ...safeUser } = user;

        // Union of all permission keys across every active DutyProfile assignment
        const permissions: string[] = staff
            ? [...new Set(
                staff.assignments.flatMap(a =>
                    a.dutyProfile.permissions.map(p => p.permission.key)
                )
              )]
            : [];

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

        return { user: safeUser, staff: staffProfile, access_token, refresh_token };
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
                data: { userId, password: user.password },
            }),
            this.databaseService.client.user.update({
                where: { id: userId },
                data: { password: newHash, refreshToken: null },
            }),
        ]);

        return { message: 'Password changed successfully. Please log in again.' };
    }

    async forgotPassword(dto: ForgotPasswordDto) {
        const user = await this.databaseService.client.user.findUnique({
            where: { email: dto.email, deletedAt: null },
        });

        // Always return 200 — no enumeration
        if (!user) return { message: 'If that email exists, a reset token has been generated.' };

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000);

        await this.databaseService.client.personalAccessToken.upsert({
            where: { userId_type: { userId: user.id, type: $Enums.TokenType.PASSWORDRESET } },
            create: { userId: user.id, token, type: $Enums.TokenType.PASSWORDRESET, expiry },
            update: { token, expiry, deletedAt: null },
        });

        return { token, expiresAt: expiry };
    }

    async resetPassword(dto: ResetPasswordDto) {
        const record = await this.databaseService.client.personalAccessToken.findFirst({
            where: {
                token: dto.token,
                type: $Enums.TokenType.PASSWORDRESET,
                deletedAt: null,
                expiry: { gt: new Date() },
            },
        });

        if (!record) throw new BadRequestException('Reset token is invalid or has expired');

        const user = await this.databaseService.client.user.findUnique({ where: { id: record.userId } });
        if (!user) throw new NotFoundException('User not found');

        await this.assertNotInHistory(user.id, dto.newPassword);

        const newHash = await bcrypt.hash(dto.newPassword, 10);

        await this.databaseService.client.$transaction([
            this.databaseService.client.passwordHistory.create({
                data: { userId: user.id, password: user.password },
            }),
            this.databaseService.client.user.update({
                where: { id: user.id },
                data: { password: newHash, loginAttempts: 0, refreshToken: null },
            }),
            this.databaseService.client.personalAccessToken.update({
                where: { id: record.id },
                data: { deletedAt: new Date() },
            }),
        ]);

        return { message: 'Password reset successfully. Please log in.' };
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
