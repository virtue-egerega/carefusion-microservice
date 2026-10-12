import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG, ADMIN_DUTY_PROFILE_PERMISSIONS } from './permissions.catalog';

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

    async seedForOrg(prisma: any, adminStaffId: string): Promise<void> {
        // 1. Seed all platform permissions (upsert — idempotent)
        for (const perm of PERMISSION_CATALOG) {
            await prisma.permission.upsert({
                where:  { key: perm.key },
                create: { key: perm.key, description: perm.description },
                update: {},
            });
        }

        // 2. Resolve the ADMINISTRATION department (seeded just before this call)
        const adminDept = await prisma.department.findUnique({
            where: { systemKey: 'ADMINISTRATION' },
        });

        // 3. Upsert the "Hospital Administrator" DutyProfile
        //    role = SUPERADMIN; no queues (global — permissions apply unconditionally per PRD §7)
        const dutyProfile = await prisma.dutyProfile.upsert({
            where:  { name: 'Hospital Administrator' },
            create: { name: 'Hospital Administrator', role: 'SUPERADMIN', departmentId: adminDept?.id ?? null },
            update: {},
        });

        // 4. Link admin permissions to the DutyProfile
        const permissions = await prisma.permission.findMany({
            where: { key: { in: [...ADMIN_DUTY_PROFILE_PERMISSIONS] } },
            select: { id: true },
        });

        for (const perm of permissions) {
            await prisma.dutyProfilePermission.upsert({
                where:  { dutyProfileId_permissionId: { dutyProfileId: dutyProfile.id, permissionId: perm.id } },
                create: { dutyProfileId: dutyProfile.id, permissionId: perm.id },
                update: {},
            });
        }

        // 5. Assign the DutyProfile to the SUPERADMIN staff member
        await prisma.staffAssignment.upsert({
            where:  { staffId_dutyProfileId: { staffId: adminStaffId, dutyProfileId: dutyProfile.id } },
            create: { staffId: adminStaffId, dutyProfileId: dutyProfile.id, assignedBy: adminStaffId },
            update: {},
        });

        // 6. Set the SUPERADMIN's departmentId to ADMINISTRATION
        if (adminDept) {
            await prisma.hospitalStaff.update({
                where: { id: adminStaffId },
                data:  { departmentId: adminDept.id },
            });
        }
    }
}
