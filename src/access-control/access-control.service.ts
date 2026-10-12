import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG, ADMIN_DUTY_PROFILE_PERMISSIONS, RECEPTIONIST_DUTY_PROFILE_PERMISSIONS } from './permissions.catalog';

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

    // Seeds permissions + duty profile catalog. No user dependency — safe to run anytime.
    async seedCatalog(prisma: any): Promise<void> {
        // 1. Upsert all platform permissions
        for (const perm of PERMISSION_CATALOG) {
            await prisma.permission.upsert({
                where:  { key: perm.key },
                create: { key: perm.key, name: perm.name, description: perm.description },
                update: { name: perm.name, description: perm.description },
            });
        }

        // 2. Hospital Administrator DutyProfile (SUPERADMIN, ADMINISTRATION dept, global — no queues)
        const adminDept = await prisma.department.findUnique({ where: { systemKey: 'ADMINISTRATION' } });
        const adminProfile = await prisma.dutyProfile.upsert({
            where:  { name: 'Hospital Administrator' },
            create: { name: 'Hospital Administrator', role: 'SUPERADMIN', departmentId: adminDept?.id ?? null },
            update: {},
        });
        const adminPerms = await prisma.permission.findMany({
            where: { key: { in: [...ADMIN_DUTY_PROFILE_PERMISSIONS] } },
            select: { id: true },
        });
        for (const perm of adminPerms) {
            await prisma.dutyProfilePermission.upsert({
                where:  { dutyProfileId_permissionId: { dutyProfileId: adminProfile.id, permissionId: perm.id } },
                create: { dutyProfileId: adminProfile.id, permissionId: perm.id },
                update: {},
            });
        }

        // 3. Receptionist DutyProfile (RECEPTION dept, RECEPTION_QUEUE)
        const receptionDept  = await prisma.department.findUnique({ where: { systemKey: 'RECEPTION' } });
        const receptionQueue = receptionDept
            ? await prisma.queue.findUnique({ where: { systemKey: 'RECEPTION_QUEUE' } })
            : null;
        const receptionistProfile = await prisma.dutyProfile.upsert({
            where:  { name: 'Receptionist' },
            create: { name: 'Receptionist', role: 'RECEPTIONIST', departmentId: receptionDept?.id ?? null },
            update: {},
        });
        const receptionistPerms = await prisma.permission.findMany({
            where: { key: { in: [...RECEPTIONIST_DUTY_PROFILE_PERMISSIONS] } },
            select: { id: true },
        });
        for (const perm of receptionistPerms) {
            await prisma.dutyProfilePermission.upsert({
                where:  { dutyProfileId_permissionId: { dutyProfileId: receptionistProfile.id, permissionId: perm.id } },
                create: { dutyProfileId: receptionistProfile.id, permissionId: perm.id },
                update: {},
            });
        }
        if (receptionQueue) {
            await prisma.dutyProfileQueue.upsert({
                where:  { dutyProfileId_queueId: { dutyProfileId: receptionistProfile.id, queueId: receptionQueue.id } },
                create: { dutyProfileId: receptionistProfile.id, queueId: receptionQueue.id },
                update: {},
            });
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
