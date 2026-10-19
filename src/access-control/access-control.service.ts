import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG, RETIRED_PERMISSIONS, SYSTEM_DUTY_PROFILES } from './permissions.catalog';

@Injectable()
export class AccessControlService {

    getPermissionsGrouped(limit = 50, offset = 0, search?: string) {
        const term = search?.toLowerCase();
        const filtered = term
            ? PERMISSION_CATALOG.filter(
                  p =>
                      p.key.includes(term) ||
                      p.name.toLowerCase().includes(term) ||
                      p.description.toLowerCase().includes(term),
              )
            : PERMISSION_CATALOG;

        const count = filtered.length;
        const page = filtered.slice(offset, offset + limit);

        const groups: Record<string, { key: string; name: string; description: string }[]> = {};
        for (const perm of page) {
            const group = perm.key.split('.')[0];
            if (!groups[group]) groups[group] = [];
            groups[group].push({ key: perm.key, name: perm.name, description: perm.description });
        }

        return { count, docs: groups };
    }

    // Seeds permissions + system duty profiles. No user dependency — safe to run anytime.
    async seedCatalog(prisma: any): Promise<void> {
        // 1. Upsert all platform permissions
        for (const perm of PERMISSION_CATALOG) {
            await prisma.permission.upsert({
                where:  { key: perm.key },
                create: { key: perm.key, name: perm.name, description: perm.description },
                update: { name: perm.name, description: perm.description },
            });
        }

        // 2. System duty profiles, their permissions, queues and send queues
        for (const def of SYSTEM_DUTY_PROFILES) {
            const dept = await prisma.department.findUnique({ where: { systemKey: def.departmentKey } });
            const profile = await prisma.dutyProfile.upsert({
                where:  { name: def.name },
                create: { name: def.name, role: def.role, departmentId: dept?.id ?? null },
                update: {},
            });

            const perms = await prisma.permission.findMany({
                where: { key: { in: def.permissions } },
                select: { id: true },
            });
            for (const perm of perms) {
                await prisma.dutyProfilePermission.upsert({
                    where:  { dutyProfileId_permissionId: { dutyProfileId: profile.id, permissionId: perm.id } },
                    create: { dutyProfileId: profile.id, permissionId: perm.id },
                    update: {},
                });
            }

            const queues = await prisma.queue.findMany({
                where: { systemKey: { in: def.queueKeys } },
                select: { id: true },
            });
            for (const queue of queues) {
                await prisma.dutyProfileQueue.upsert({
                    where:  { dutyProfileId_queueId: { dutyProfileId: profile.id, queueId: queue.id } },
                    create: { dutyProfileId: profile.id, queueId: queue.id },
                    update: {},
                });
            }

            const sendQueues = await prisma.queue.findMany({
                where: { systemKey: { in: def.sendQueueKeys ?? [] } },
                select: { id: true },
            });
            for (const queue of sendQueues) {
                await prisma.dutyProfileSendQueue.upsert({
                    where:  { dutyProfileId_queueId: { dutyProfileId: profile.id, queueId: queue.id } },
                    create: { dutyProfileId: profile.id, queueId: queue.id },
                    update: {},
                });
            }
        }

        // 3. Retired permissions: carry holders over to the replacement keys, then remove
        await this.retirePermissions(prisma);
    }

    private async retirePermissions(prisma: any): Promise<void> {
        const systemNames = SYSTEM_DUTY_PROFILES.map(p => p.name);

        for (const [oldKey, replacements] of Object.entries(RETIRED_PERMISSIONS)) {
            const old = await prisma.permission.findUnique({ where: { key: oldKey } });
            if (!old) continue;

            const holders = await prisma.dutyProfilePermission.findMany({
                where:  { permissionId: old.id, dutyProfile: { name: { notIn: systemNames } } },
                select: { dutyProfileId: true },
            });
            const newPerms = await prisma.permission.findMany({
                where:  { key: { in: replacements } },
                select: { id: true },
            });
            for (const { dutyProfileId } of holders) {
                for (const perm of newPerms) {
                    await prisma.dutyProfilePermission.upsert({
                        where:  { dutyProfileId_permissionId: { dutyProfileId, permissionId: perm.id } },
                        create: { dutyProfileId, permissionId: perm.id },
                        update: {},
                    });
                }
            }

            // Cascades the old DutyProfilePermission rows
            await prisma.permission.delete({ where: { id: old.id } });
        }
    }

    // Called at onboarding only — assigns the SUPERADMIN to their duty profile and sets department.
    async seedForOrg(prisma: any, adminStaffId: string): Promise<void> {
        await this.seedCatalog(prisma);

        const adminDept    = await prisma.department.findUnique({ where: { systemKey: 'ADMINISTRATION' } });
        const adminProfile = await prisma.dutyProfile.findUnique({ where: { name: 'Hospital Administrator' } });

        if (adminProfile) {
            await prisma.staffAssignment.upsert({
                where:  { staffId_dutyProfileId: { staffId: adminStaffId, dutyProfileId: adminProfile.id } },
                create: { staffId: adminStaffId, dutyProfileId: adminProfile.id, assignedBy: adminStaffId },
                update: {},
            });
        }

        if (adminDept) {
            await prisma.hospitalStaff.update({
                where: { id: adminStaffId },
                data:  { departmentId: adminDept.id },
            });
        }
    }
}
