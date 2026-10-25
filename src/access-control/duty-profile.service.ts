import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionsService } from '../auth/sessions.service';
import {
    CreateDutyProfileDto,
    UpdateDutyProfileDto,
    ManageQueuesDto,
    ManagePermissionsDto,
    AssignDutyProfileDto,
} from '@shared/contracts/access-control';

@Injectable()
export class DutyProfileService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly sessions: SessionsService,
    ) {}

    // ── CRUD ────────────────────────────────────────────────────────────────

    async create(dto: CreateDutyProfileDto) {
        const existing = await this.databaseService.client.dutyProfile.findUnique({ where: { name: dto.name } });
        if (existing) throw new ConflictException(`A duty profile named "${dto.name}" already exists`);

        // One transaction: an unknown queue or permission must not leave a half-built profile behind
        const profile = await this.databaseService.transaction(async () => {
            const created = await this.databaseService.client.dutyProfile.create({
                data: { name: dto.name, role: dto.role, departmentId: dto.departmentId },
            });
            if (dto.queueIds?.length) await this.linkQueues(created.id, dto.queueIds);
            if (dto.sendQueueIds?.length) await this.linkSendQueues(created.id, dto.sendQueueIds);
            if (dto.permissionKeys?.length) await this.linkPermissionKeys(created.id, dto.permissionKeys);
            return created;
        });

        return this.findOne(profile.id);
    }

    async findAll(limit = 20, offset = 0, search?: string) {
        const where: any = {
            deletedAt: null,
            ...(search && {
                name: { contains: search, mode: 'insensitive' },
            }),
        };
        const [count, docs] = await this.databaseService.client.$transaction([
            this.databaseService.client.dutyProfile.count({ where }),
            this.databaseService.client.dutyProfile.findMany({
                where,
                orderBy: { name: 'asc' },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    name: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                    department: { select: { id: true, name: true, systemKey: true } },
                    _count: { select: { queues: true, permissions: true } },
                },
            }),
        ]);

        return { count, docs };
    }

    async findOne(id: string) {
        const profile = await this.databaseService.client.dutyProfile.findUnique({
            where: { id },
            include: {
                department: { select: { id: true, name: true, systemKey: true } },
                queues: { include: { queue: { select: { id: true, name: true, systemKey: true } } } },
                sendQueues: { include: { queue: { select: { id: true, name: true, systemKey: true } } } },
                permissions: { include: { permission: { select: { id: true, key: true, name: true, description: true } } } },
            },
        });
        if (!profile || profile.deletedAt) throw new NotFoundException('Duty profile not found');
        return profile;
    }

    async getStats(id: string) {
        await this.assertExists(id);

        const now = new Date();
        const [permissions, queues, assignedStaff] = await this.databaseService.client.$transaction([
            this.databaseService.client.dutyProfilePermission.count({ where: { dutyProfileId: id } }),
            this.databaseService.client.dutyProfileQueue.count({ where: { dutyProfileId: id } }),
            this.databaseService.client.staffAssignment.count({
                where: {
                    dutyProfileId: id,
                    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                },
            }),
        ]);

        return { assignedStaff, permissions, queues };
    }

    async update(id: string, dto: UpdateDutyProfileDto) {
        await this.assertExists(id);
        return this.databaseService.client.dutyProfile.update({ where: { id }, data: dto });
    }

    async remove(id: string, deletedBy: string) {
        const profile = await this.databaseService.client.dutyProfile.findUnique({
            where:  { id, deletedAt: null },
            select: { _count: { select: { assignments: true } } },
        });
        if (!profile) throw new NotFoundException('Duty profile not found');

        // Never assigned: no history to keep, so remove it outright (its links cascade) and free the name
        if (profile._count.assignments === 0) {
            return this.databaseService.client.dutyProfile.delete({ where: { id } });
        }

        const removed = await this.databaseService.client.dutyProfile.update({
            where: { id },
            data: { deletedAt: new Date(), deletedBy },
        });
        await this.requireHoldersRelogin(id);
        return removed;
    }

    // ── QUEUES ───────────────────────────────────────────────────────────────

    async addQueues(id: string, dto: ManageQueuesDto) {
        await this.assertExists(id);
        await this.linkQueues(id, dto.queueIds);
        await this.requireHoldersRelogin(id);
        return this.findOne(id);
    }

    async removeQueue(id: string, queueId: string) {
        await this.assertExists(id);
        await this.databaseService.client.dutyProfileQueue.deleteMany({
            where: { dutyProfileId: id, queueId },
        });
        await this.requireHoldersRelogin(id);
        return this.findOne(id);
    }

    // ── SEND QUEUES ──────────────────────────────────────────────────────────
    // Checked from the database when a patient is sent (not carried in the token), so changing them
    // needs no re-login.

    async addSendQueues(id: string, dto: ManageQueuesDto) {
        await this.assertExists(id);
        await this.linkSendQueues(id, dto.queueIds);
        return this.findOne(id);
    }

    async removeSendQueue(id: string, queueId: string) {
        await this.assertExists(id);
        await this.databaseService.client.dutyProfileSendQueue.deleteMany({
            where: { dutyProfileId: id, queueId },
        });
        return this.findOne(id);
    }

    // ── PERMISSIONS ──────────────────────────────────────────────────────────

    async addPermissions(id: string, dto: ManagePermissionsDto) {
        await this.assertExists(id);
        await this.linkPermissionKeys(id, dto.permissionKeys);
        await this.requireHoldersRelogin(id);
        return this.findOne(id);
    }

    async removePermission(id: string, permissionId: string) {
        await this.assertExists(id);
        await this.databaseService.client.dutyProfilePermission.deleteMany({
            where: { dutyProfileId: id, permissionId },
        });
        await this.requireHoldersRelogin(id);
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

        const assignment = await this.databaseService.client.staffAssignment.create({
            data: {
                staffId,
                dutyProfileId: dto.dutyProfileId,
                assignedBy,
                endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
            },
            include: { dutyProfile: { select: { id: true, name: true } } },
        });
        await this.sessions.requireRelogin([staffId], 'ACCESS_CHANGED');
        return assignment;
    }

    async unassignFromStaff(staffId: string, dutyProfileId: string) {
        const assignment = await this.databaseService.client.staffAssignment.findUnique({
            where: { staffId_dutyProfileId: { staffId, dutyProfileId } },
        });
        if (!assignment) throw new NotFoundException('Assignment not found');

        await this.databaseService.client.staffAssignment.delete({
            where: { staffId_dutyProfileId: { staffId, dutyProfileId } },
        });
        await this.sessions.requireRelogin([staffId], 'ACCESS_CHANGED');
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
                        department: { select: { id: true, name: true } },
                        permissions: { include: { permission: { select: { key: true } } } },
                        queues: { include: { queue: { select: { id: true, name: true, systemKey: true } } } },
                    },
                },
            },
        });
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * A profile's permissions or queues changed: everyone holding it must log in again so their
     * token and their UI pick up the change (09 §9.3).
     */
    private async requireHoldersRelogin(dutyProfileId: string) {
        const holders = await this.databaseService.client.staffAssignment.findMany({
            where:  { dutyProfileId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
            select: { staffId: true },
        });
        await this.sessions.requireRelogin(holders.map(h => h.staffId), 'ACCESS_CHANGED');
    }

    private async assertExists(id: string) {
        const p = await this.databaseService.client.dutyProfile.findUnique({ where: { id, deletedAt: null } });
        if (!p) throw new NotFoundException('Duty profile not found');
    }

    private async linkQueues(dutyProfileId: string, queueIds: string[]) {
        // Only seeded, active queues can be assigned
        const found = await this.databaseService.client.queue.findMany({
            where:  { id: { in: queueIds }, isActive: true, deletedAt: null },
            select: { id: true },
        });
        const foundIds = new Set(found.map(q => q.id));
        const missing = queueIds.filter(id => !foundIds.has(id));
        if (missing.length) throw new NotFoundException(`Unknown or inactive queues: ${missing.join(', ')}`);

        for (const queueId of queueIds) {
            await this.databaseService.client.dutyProfileQueue.upsert({
                where: { dutyProfileId_queueId: { dutyProfileId, queueId } },
                create: { dutyProfileId, queueId },
                update: {},
            });
        }
    }

    private async linkSendQueues(dutyProfileId: string, queueIds: string[]) {
        const found = await this.databaseService.client.queue.findMany({
            where:  { id: { in: queueIds }, isActive: true, deletedAt: null },
            select: { id: true },
        });
        const foundIds = new Set(found.map(q => q.id));
        const missing = queueIds.filter(id => !foundIds.has(id));
        if (missing.length) throw new NotFoundException(`Unknown or inactive queues: ${missing.join(', ')}`);

        await this.databaseService.client.dutyProfileSendQueue.createMany({
            data: queueIds.map(queueId => ({ dutyProfileId, queueId })),
            skipDuplicates: true,
        });
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
