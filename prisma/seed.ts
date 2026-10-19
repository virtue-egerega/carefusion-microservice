import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CLINIC_CATALOG, DEPARTMENT_CATALOG, RETIRED_QUEUE_KEYS, getActiveKeys } from '../src/departments/departments.catalog';
import { PERMISSION_CATALOG, SYSTEM_DUTY_PROFILES } from '../src/access-control/permissions.catalog';
import { AccessControlService } from '../src/access-control/access-control.service';

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

    await prisma.queue.updateMany({
        where: { systemKey: { in: RETIRED_QUEUE_KEYS }, deletedAt: null },
        data:  { isActive: false, deletedAt: new Date() },
    });

    for (const clinic of CLINIC_CATALOG) {
        await prisma.clinic.upsert({
            where:  { systemKey: clinic.systemKey },
            create: {
                systemKey:         clinic.systemKey,
                name:              clinic.name,
                isActive:          activeKeys.has(clinic.departmentKey),
                department:        { connect: { systemKey: clinic.departmentKey } },
                triageQueue:       { connect: { systemKey: clinic.triageQueue } },
                consultationQueue: { connect: { systemKey: clinic.consultationQueue } },
            },
            update: {},
        });
    }

    console.log(`✓ Departments, queues & clinics seeded (${businessType})`);
}

async function seedAccessControl() {
    await new AccessControlService().seedCatalog(prisma);
    console.log(`✓ ${PERMISSION_CATALOG.length} permissions and ${SYSTEM_DUTY_PROFILES.length} system duty profiles seeded`);
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
