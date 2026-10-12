import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG, ADMIN_DUTY_PROFILE_PERMISSIONS } from './permissions.catalog';

@Injectable()
export class AccessControlService {

    async seedForOrg(prisma: any, adminStaffId: string): Promise<void> {
        // 1. Seed all platform permissions (upsert — idempotent)
        for (const perm of PERMISSION_CATALOG) {
            await prisma.permission.upsert({
                where:  { key: perm.key },
                create: { key: perm.key, description: perm.description },
                update: {},
            });
        }

        // 2. Upsert the "Administrator" Role
        const adminRole = await prisma.role.upsert({
            where:  { name: 'Administrator' },
            create: { name: 'Administrator', description: 'System-wide administrative access' },
            update: {},
        });

        // 3. Resolve the ADMINISTRATION department (seeded just before this call)
        const adminDept = await prisma.department.findUnique({
            where: { systemKey: 'ADMINISTRATION' },
        });

        // 4. Upsert the "Hospital Administrator" DutyProfile
        //    departmentId = ADMINISTRATION; no queues (global — permissions apply unconditionally per PRD §7)
        const dutyProfile = await prisma.dutyProfile.upsert({
            where:  { name: 'Hospital Administrator' },
            create: { name: 'Hospital Administrator', roleId: adminRole.id, departmentId: adminDept?.id ?? null },
            update: {},
        });

        // 5. Link admin permissions to the DutyProfile
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

        // 6. Assign the DutyProfile to the SUPERADMIN staff member
        await prisma.staffAssignment.upsert({
            where:  { staffId_dutyProfileId: { staffId: adminStaffId, dutyProfileId: dutyProfile.id } },
            create: { staffId: adminStaffId, dutyProfileId: dutyProfile.id, assignedBy: adminStaffId },
            update: {},
        });

        // 7. Set the SUPERADMIN's departmentId to ADMINISTRATION
        if (adminDept) {
            await prisma.hospitalStaff.update({
                where: { id: adminStaffId },
                data:  { departmentId: adminDept.id },
            });
        }
    }
}
