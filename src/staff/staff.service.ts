import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { withConstraintErrors } from '../database/prisma-errors';
import { CreateStaffDto } from '@shared/contracts/staff/create-staff.dto';
import { UpdateStaffDto } from '@shared/contracts/staff/update-staff.dto';
import { $Enums } from '../../generated/prisma/client';
import { generateTemporaryPassword } from '../auth/temporary-password';
import { SessionsService } from '../auth/sessions.service';
import * as bcrypt from 'bcrypt';

const STAFF_INCLUDE = {
    user: {
        select: {
            id: true, email: true, firstName: true, middleName: true, lastName: true,
            phone: true, status: true, type: true, mustChangePassword: true, createdAt: true, updatedAt: true,
        },
    },
    department: { select: { id: true, name: true, systemKey: true } },
    branch: { select: { id: true, name: true, code: true } },
    assignments: {
        where: {
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        include: {
            dutyProfile: {
                select: {
                    id: true, name: true, role: true,
                    permissions: { include: { permission: { select: { key: true } } } },
                },
            },
        },
    },
};

/** Staff accounts, scoped to the admin's organisation (from the token). */
@Injectable()
export class StaffService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly sessions: SessionsService,
    ) {}

    /**
     * Creates the account with a temporary password, returned once in this response only.
     * The new user must change it at first login (09 §3). `createdBy` records the admin, who is
     * also who issued that first password.
     */
    async create(dto: CreateStaffDto, organizationId: string, createdBy: string) {
        const [profile, branch] = await Promise.all([
            this.databaseService.client.dutyProfile.findFirst({
                where:  { id: dto.dutyProfileId, deletedAt: null },
                select: { id: true },
            }),
            this.databaseService.client.branch.findFirst({
                where:  { id: dto.branchId, organizationId },
                select: { id: true },
            }),
        ]);
        if (!profile) throw new NotFoundException('Duty profile not found');
        if (!branch) throw new NotFoundException('Branch not found');

        const temporaryPassword = generateTemporaryPassword();
        const hashed = await bcrypt.hash(temporaryPassword, 10);

        const staff = await this.databaseService.transaction(async () => {
            const client = this.databaseService.client;

            const user = await withConstraintErrors(
                () => client.user.create({
                    data: {
                        email: dto.email,
                        password: hashed,
                        mustChangePassword: true,
                        firstName: dto.firstName,
                        middleName: dto.middleName,
                        lastName: dto.lastName,
                        phone: dto.phone,
                        type: $Enums.UserType.HOSPITAL_STAFF,
                        status: $Enums.UserStatus.ACTIVE,
                    },
                }),
                { conflict: 'A user with this email already exists' },
            );

            const created = await withConstraintErrors(
                () => client.hospitalStaff.create({
                    data: {
                        id: user.id,
                        hospitalId: organizationId,
                        branchId: dto.branchId,
                        role: dto.role as $Enums.HospitalStaffRole,
                        departmentId: dto.departmentId,
                        createdBy,
                    },
                }),
                { notFound: 'Department not found' },
            );

            // The admin's chosen duty profile decides permissions and queues; the staff role is only a title
            await client.staffAssignment.create({
                data: {
                    staffId: created.id,
                    dutyProfileId: dto.dutyProfileId,
                    assignedBy: createdBy,
                },
            });

            return client.hospitalStaff.findUniqueOrThrow({
                where: { id: created.id },
                include: STAFF_INCLUDE,
            });
        });

        return { ...staff, temporaryPassword };
    }

    /**
     * Admin password reset (09 §4): a new temporary password, returned once in this response only.
     * The user must change it at next login, existing refresh sessions are revoked, and the reset is
     * recorded in PasswordHistory with the admin who issued it.
     */
    async resetPassword(staffId: string, organizationId: string, resetBy: string) {
        if (staffId === resetBy) {
            throw new BadRequestException('Use change-password to change your own password');
        }

        const user = await this.databaseService.client.user.findFirst({
            where:  { id: staffId, deletedAt: null, staff: { hospitalId: organizationId } },
            select: { id: true, password: true },
        });
        if (!user) throw new NotFoundException('Staff member not found');

        const temporaryPassword = generateTemporaryPassword();
        const hashed = await bcrypt.hash(temporaryPassword, 10);

        await this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            await client.passwordHistory.create({
                data: {
                    userId:    user.id,
                    password:  user.password,
                    changedBy: resetBy,
                    reason:    $Enums.PasswordChangeReason.ADMIN_RESET,
                },
            });
            await client.user.update({
                where: { id: user.id },
                data: {
                    password:           hashed,
                    mustChangePassword: true,
                    loginAttempts:      0,
                    updatedBy:          resetBy,
                },
            });
        });

        // Every current session of theirs ends (09 §9.3)
        await this.sessions.requireRelogin([user.id], 'PASSWORD_RESET');

        return {
            message: 'Temporary password issued. Hand it to the staff member; they must change it at next login.',
            temporaryPassword,
        };
    }

    async findAll(organizationId: string, limit = 20, offset = 0, search?: string) {
        const userWhere: any = { deletedAt: null, type: $Enums.UserType.HOSPITAL_STAFF };

        if (search) {
            userWhere.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const where = { hospitalId: organizationId, user: userWhere };
        const [count, docs] = await this.databaseService.client.$transaction([
            this.databaseService.client.hospitalStaff.count({ where }),
            this.databaseService.client.hospitalStaff.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    role: true,
                    createdAt: true,
                    createdBy: true,
                    user: {
                        select: {
                            id: true, email: true, firstName: true, middleName: true,
                            lastName: true, phone: true, status: true, mustChangePassword: true,
                        },
                    },
                    department: { select: { id: true, name: true, systemKey: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    // Active duty profiles: what this person actually works (permissions + queues)
                    assignments: {
                        where:  { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], dutyProfile: { deletedAt: null } },
                        select: { dutyProfile: { select: { id: true, name: true } } },
                    },
                },
            }),
        ]);

        return { count, docs };
    }

    async findOne(id: string, organizationId: string) {
        const staff = await this.databaseService.client.hospitalStaff.findFirst({
            where: { id, hospitalId: organizationId },
            include: STAFF_INCLUDE,
        });
        if (!staff) throw new NotFoundException('Staff member not found');
        return staff;
    }

    async update(id: string, dto: UpdateStaffDto, organizationId: string, updatedBy: string) {
        const staff = await this.databaseService.client.hospitalStaff.findFirst({ where: { id, hospitalId: organizationId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const { role, departmentId, branchId, status, ...userFields } = dto;

        if (branchId) {
            const branch = await this.databaseService.client.branch.count({ where: { id: branchId, organizationId } });
            if (!branch) throw new NotFoundException('Branch not found');
        }

        const updated = await this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            await client.user.update({
                where: { id: staff.id },
                data: {
                    ...userFields,
                    ...(status && { status: status as $Enums.UserStatus }),
                    updatedBy,
                },
            });

            return client.hospitalStaff.update({
                where: { id },
                data: {
                    ...(role && { role: role as $Enums.HospitalStaffRole }),
                    ...(departmentId !== undefined && { departmentId }),
                    ...(branchId && { branchId }),
                },
                include: STAFF_INCLUDE,
            });
        });

        // Role, department and status shape what the user sees and may do: make them log in again
        if (role || departmentId !== undefined || branchId || status) {
            const disabled = status && status !== $Enums.UserStatus.ACTIVE;
            await this.sessions.requireRelogin([staff.id], disabled ? 'ACCOUNT_DISABLED' : 'ACCESS_CHANGED');
        }
        return updated;
    }

    async remove(id: string, organizationId: string, deletedBy: string) {
        const { count } = await this.databaseService.client.user.updateMany({
            where: { id, deletedAt: null, staff: { hospitalId: organizationId } },
            data:  { deletedAt: new Date(), deletedBy, status: $Enums.UserStatus.DELETED },
        });
        if (!count) throw new NotFoundException('Staff member not found');

        await this.sessions.requireRelogin([id], 'ACCOUNT_DISABLED');

        return { message: 'Staff member removed successfully' };
    }
}
