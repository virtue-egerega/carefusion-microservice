import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
    CreateDutyProfileDto,
    UpdateDutyProfileDto,
    ManageQueuesDto,
    ManagePermissionsDto,
    AssignDutyProfileDto,
} from '@shared/contracts/access-control';

@Injectable()
export class DutyProfileService {
    constructor(private readonly databaseService: DatabaseService) {}

    // ── CRUD ────────────────────────────────────────────────────────────────

    async create(dto: CreateDutyProfileDto) {
        const existing = await this.databaseService.client.dutyProfile.findUnique({ where: { name: dto.name } });
        if (existing) throw new ConflictException(`A duty profile named "${dto.name}" already exists`);

        const profile = await this.databaseService.client.dutyProfile.create({
            data: { name: dto.name, roleId: dto.roleId, departmentId: dto.departmentId },
        });

        if (dto.queueIds?.length) await this.linkQueues(profile.id, dto.queueIds);
        if (dto.permissionKeys?.length) await this.linkPermissionKeys(profile.id, dto.permissionKeys);

        return this.findOne(profile.id);
    }

    async findAll() {
        return this.databaseService.client.dutyProfile.findMany({
            where: { deletedAt: null },
            orderBy: { name: 'asc' },
            include: {
                role: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, systemKey: true } },
                queues: { include: { queue: { select: { id: true, name: true, systemKey: true } } } },
                permissions: { include: { permission: { select: { id: true, key: true, description: true } } } },
            },
        });
    }

    async findOne(id: string) {
        const profile = await this.databaseService.client.dutyProfile.findUnique({
            where: { id },
            include: {
                role: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, systemKey: true } },
                queues: { include: { queue: { select: { id: true, name: true, systemKey: true } } } },
                permissions: { include: { permission: { select: { id: true, key: true, description: true } } } },
            },
        });
        if (!profile) throw new NotFoundException('Duty profile not found');
        return profile;
    }

    async update(id: string, dto: UpdateDutyProfileDto) {
        await this.assertExists(id);
        return this.databaseService.client.dutyProfile.update({ where: { id }, data: dto });
    }

    async remove(id: string, deletedBy: string) {
        await this.assertExists(id);
        return this.databaseService.client.dutyProfile.update({
            where: { id },
            data: { deletedAt: new Date(), deletedBy },
        });
    }

    // ── QUEUES ───────────────────────────────────────────────────────────────

    async addQueues(id: string, dto: ManageQueuesDto) {
        await this.assertExists(id);
        await this.linkQueues(id, dto.queueIds);
        return this.findOne(id);
    }

    async removeQueue(id: string, queueId: string) {
        await this.assertExists(id);
        await this.databaseService.client.dutyProfileQueue.deleteMany({
            where: { dutyProfileId: id, queueId },
        });
        return this.findOne(id);
    }

    // ── PERMISSIONS ──────────────────────────────────────────────────────────

    async addPermissions(id: string, dto: ManagePermissionsDto) {
        await this.assertExists(id);
        await this.linkPermissionKeys(id, dto.permissionKeys);
        return this.findOne(id);
    }

    async removePermission(id: string, permissionId: string) {
        await this.assertExists(id);
        await this.databaseService.client.dutyProfilePermission.deleteMany({
            where: { dutyProfileId: id, permissionId },
        });
        return this.findOne(id);
    }

    // ── STAFF ASSIGNMENT ─────────────────────────────────────────────────────

    async assignToStaff(staffId: string, dto: AssignDutyProfileDto, assignedBy: string) {
        const staff = await this.databaseService.client.hospitalStaff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        await this.assertExists(dto.dutyProfileId);

        const existing = await this.databaseService.client.staffAssignment.findUnique({
            where: { staffId_dutyProfileId: { staffId, dutyProfileId: dto.dutyProfileId } },
        });
        if (existing) throw new ConflictException('This duty profile is already assigned to this staff member');

        return this.databaseService.client.staffAssignment.create({
            data: {
                staffId,
                dutyProfileId: dto.dutyProfileId,
                assignedBy,
                endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
            },
            include: { dutyProfile: { select: { id: true, name: true } } },
        });
    }

    async unassignFromStaff(staffId: string, dutyProfileId: string) {
        const assignment = await this.databaseService.client.staffAssignment.findUnique({
            where: { staffId_dutyProfileId: { staffId, dutyProfileId } },
        });
        if (!assignment) throw new NotFoundException('Assignment not found');

        await this.databaseService.client.staffAssignment.delete({
            where: { staffId_dutyProfileId: { staffId, dutyProfileId } },
        });
        return { message: 'Duty profile unassigned successfully' };
    }

    async getStaffAssignments(staffId: string) {
        const staff = await this.databaseService.client.hospitalStaff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        return this.databaseService.client.staffAssignment.findMany({
            where: { staffId },
            include: {
                dutyProfile: {
                    include: {
                        role: { select: { id: true, name: true } },
                        department: { select: { id: true, name: true } },
                        permissions: { include: { permission: { select: { key: true } } } },
                        queues: { include: { queue: { select: { id: true, name: true, systemKey: true } } } },
                    },
                },
            },
        });
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async assertExists(id: string) {
        const p = await this.databaseService.client.dutyProfile.findUnique({ where: { id, deletedAt: null } });
        if (!p) throw new NotFoundException('Duty profile not found');
    }

    private async linkQueues(dutyProfileId: string, queueIds: string[]) {
        for (const queueId of queueIds) {
            await this.databaseService.client.dutyProfileQueue.upsert({
                where: { dutyProfileId_queueId: { dutyProfileId, queueId } },
                create: { dutyProfileId, queueId },
                update: {},
            });
        }
    }

    private async linkPermissionKeys(dutyProfileId: string, keys: string[]) {
        const permissions = await this.databaseService.client.permission.findMany({
            where: { key: { in: keys } },
        });
        const foundKeys = permissions.map(p => p.key);
        const missing = keys.filter(k => !foundKeys.includes(k));
        if (missing.length) throw new BadRequestException(`Unknown permission keys: ${missing.join(', ')}`);

        for (const perm of permissions) {
            await this.databaseService.client.dutyProfilePermission.upsert({
                where: { dutyProfileId_permissionId: { dutyProfileId, permissionId: perm.id } },
                create: { dutyProfileId, permissionId: perm.id },
                update: {},
            });
        }
    }
}
