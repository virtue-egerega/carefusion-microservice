import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateStaffDto } from '@shared/contracts/staff/create-staff.dto';
import { UpdateStaffDto } from '@shared/contracts/staff/update-staff.dto';
import { $Enums } from '../../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

function generatePassword(): string {
    const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower  = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const syms   = '!@#$%^&*';
    const all    = upper + lower + digits + syms;
    const rand   = (set: string) => set[crypto.randomInt(set.length)];
    const rest   = Array.from({ length: 6 }, () => rand(all)).join('');
    // guarantee at least one of each required class
    return [rand(upper), rand(lower), rand(digits), rand(syms), ...rest].sort(() => Math.random() - 0.5).join('');
}

const STAFF_INCLUDE = {
    user: {
        select: {
            id: true, email: true, firstName: true, middleName: true, lastName: true,
            phone: true, status: true, type: true, createdAt: true, updatedAt: true,
        },
    },
    department: { select: { id: true, name: true, systemKey: true } },
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

@Injectable()
export class StaffService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: CreateStaffDto) {
        const existing = await this.databaseService.client.user.findUnique({ where: { email: dto.email } });
        if (existing) throw new ConflictException('A user with this email already exists');

        if (dto.departmentId) {
            const dept = await this.databaseService.client.department.findUnique({ where: { id: dto.departmentId } });
            if (!dept) throw new NotFoundException('Department not found');
        }

        const org = await this.databaseService.client.organization.findFirst();
        if (!org) throw new NotFoundException('No organisation found');

        const plainPassword = generatePassword();
        console.log({plainPassword})
        const hashed = await bcrypt.hash(plainPassword, 10);

        const staff = await this.databaseService.client.$transaction(async (prisma) => {
            const user = await prisma.user.create({
                data: {
                    email: dto.email,
                    password: hashed,
                    firstName: dto.firstName,
                    middleName: dto.middleName,
                    lastName: dto.lastName,
                    phone: dto.phone,
                    type: $Enums.UserType.HOSPITAL_STAFF,
                    status: $Enums.UserStatus.ACTIVE,
                },
            });

            return prisma.hospitalStaff.create({
                data: {
                    id: user.id,
                    hospitalId: org.id,
                    role: dto.role as $Enums.HospitalStaffRole,
                    departmentId: dto.departmentId,
                },
                include: STAFF_INCLUDE,
            });
        });

        return { ...staff, temporaryPassword: plainPassword };
    }

    async findAll(limit = 20, offset = 0, search?: string) {
        const userWhere: any = { deletedAt: null, type: $Enums.UserType.HOSPITAL_STAFF };

        if (search) {
            userWhere.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [count, docs] = await this.databaseService.client.$transaction([
            this.databaseService.client.hospitalStaff.count({ where: { user: userWhere } }),
            this.databaseService.client.hospitalStaff.findMany({
                where: { user: userWhere },
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    role: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true, email: true, firstName: true, middleName: true,
                            lastName: true, phone: true, status: true,
                        },
                    },
                    department: { select: { id: true, name: true, systemKey: true } },
                    _count: { select: { assignments: true } },
                },
            }),
        ]);

        return { count, docs };
    }

    async findOne(id: string) {
        const staff = await this.databaseService.client.hospitalStaff.findUnique({
            where: { id },
            include: STAFF_INCLUDE,
        });
        if (!staff) throw new NotFoundException('Staff member not found');
        return staff;
    }

    async update(id: string, dto: UpdateStaffDto) {
        const staff = await this.databaseService.client.hospitalStaff.findUnique({ where: { id } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const { role, departmentId, status, updatedBy, ...userFields } = dto;

        return this.databaseService.client.$transaction(async (prisma) => {
            if (Object.keys(userFields).length || status || updatedBy) {
                await prisma.user.update({
                    where: { id: staff.id },
                    data: {
                        ...userFields,
                        ...(status && { status: status as $Enums.UserStatus }),
                        updatedBy,
                    },
                });
            }

            return prisma.hospitalStaff.update({
                where: { id },
                data: {
                    ...(role && { role: role as $Enums.HospitalStaffRole }),
                    ...(departmentId !== undefined && { departmentId }),
                },
                include: STAFF_INCLUDE,
            });
        });
    }

    async remove(id: string, deletedBy: string) {
        const staff = await this.databaseService.client.hospitalStaff.findUnique({ where: { id } });
        if (!staff) throw new NotFoundException('Staff member not found');

        await this.databaseService.client.user.update({
            where: { id: staff.id },
            data: { deletedAt: new Date(), deletedBy, status: $Enums.UserStatus.DELETED },
        });

        return { message: 'Staff member removed successfully' };
    }
}
