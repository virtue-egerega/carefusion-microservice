import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEPARTMENT_CATALOG, getActiveKeys } from '../src/departments/departments.catalog';
import { PERMISSION_CATALOG, ADMIN_DUTY_PROFILE_PERMISSIONS, RECEPTIONIST_DUTY_PROFILE_PERMISSIONS } from '../src/access-control/permissions.catalog';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

async function seedDepartments(businessType = 'HOSPITAL') {
    const activeKeys = getActiveKeys(businessType);

    for (const dept of DEPARTMENT_CATALOG) {
        const isActive = activeKeys.has(dept.systemKey);

        const created = await prisma.department.upsert({
            where:  { systemKey: dept.systemKey },
            create: { systemKey: dept.systemKey, name: dept.name, isActive },
            update: {},
        });

        for (const queue of dept.queues) {
            await prisma.queue.upsert({
                where:  { systemKey: queue.systemKey },
                create: { systemKey: queue.systemKey, name: queue.name, departmentId: created.id, isActive },
                update: {},
            });
        }
    }

    console.log(`✓ Departments & queues seeded (${businessType})`);
}

async function seedAccessControl() {
    // Permissions
    for (const perm of PERMISSION_CATALOG) {
        await prisma.permission.upsert({
            where:  { key: perm.key },
            create: { key: perm.key, name: perm.name, description: perm.description },
            update: { name: perm.name, description: perm.description },
        });
    }
    console.log(`✓ ${PERMISSION_CATALOG.length} permissions seeded`);

    // Hospital Administrator DutyProfile
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
    console.log(`✓ Hospital Administrator duty profile seeded`);

    // Receptionist DutyProfile
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
    console.log(`✓ Receptionist duty profile seeded`);
}

async function main() {
    console.log('Seeding...');
    await seedDepartments();
    await seedAccessControl();
    console.log('Done.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
