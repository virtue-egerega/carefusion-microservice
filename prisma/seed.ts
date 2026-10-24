import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CLINIC_CATALOG, DEPARTMENT_CATALOG, RETIRED_QUEUE_KEYS, getActiveKeys } from '../src/departments/departments.catalog';
import { PERMISSION_CATALOG, SYSTEM_DUTY_PROFILES } from '../src/access-control/permissions.catalog';
import { AccessControlService } from '../src/access-control/access-control.service';
import { parseIcd10Chapters, parseIcd10Codes, parseIcd10Groups } from '../src/consultations/rules/icd10-file';
import { parseTherapeuticUses } from '../src/inventory/medicines/therapeutic-uses-file';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// WHO ICD-10 2019, shared by every hospital (14 §5). Re-running adds new codes, refreshes titles and
// selectability, and retires codes the file no longer has; diagnoses already recorded keep theirs.
async function seedDiagnosisCodes() {
    const dir      = join(__dirname, 'data', 'icd10');
    const chapters = parseIcd10Chapters(readFileSync(join(dir, 'icd102019syst_chapters.txt'), 'utf8'));
    const groups   = parseIcd10Groups(readFileSync(join(dir, 'icd102019syst_groups.txt'), 'utf8'));
    const codes    = parseIcd10Codes(readFileSync(join(dir, 'icd102019syst_codes.txt'), 'utf8'), chapters);

    // chapters and groups are few: written in full each time
    for (const c of chapters) {
        await prisma.diagnosisChapter.upsert({
            where:  { codeSystem_number: { codeSystem: 'ICD_10', number: c.number } },
            create: { codeSystem: 'ICD_10', ...c },
            update: { numeral: c.numeral, title: c.title, position: c.position },
        });
    }
    for (const g of groups) {
        await prisma.diagnosisCodeGroup.upsert({
            where:  { codeSystem_firstCode: { codeSystem: 'ICD_10', firstCode: g.firstCode } },
            create: { codeSystem: 'ICD_10', ...g },
            update: { lastCode: g.lastCode, chapter: g.chapter, title: g.title, position: g.position },
        });
    }
    await prisma.diagnosisCodeGroup.deleteMany({ where: { codeSystem: 'ICD_10', firstCode: { notIn: groups.map(g => g.firstCode) } } });

    const existing = new Map(
        (await prisma.diagnosisCode.findMany({ where: { codeSystem: 'ICD_10' }, select: { code: true, title: true, chapter: true, selectable: true, isActive: true } }))
            .map(c => [c.code, c]),
    );
    const added   = codes.filter(c => !existing.has(c.code));
    const changed = codes.filter(c => {
        const old = existing.get(c.code);
        return old && (old.title !== c.title || old.chapter !== c.chapter || old.selectable !== c.selectable || !old.isActive);
    });

    for (let i = 0; i < added.length; i += 1000) {
        await prisma.diagnosisCode.createMany({ data: added.slice(i, i + 1000).map(c => ({ codeSystem: 'ICD_10' as const, ...c })), skipDuplicates: true });
    }
    for (const c of changed) {
        await prisma.diagnosisCode.update({
            where: { codeSystem_code: { codeSystem: 'ICD_10', code: c.code } },
            data:  { title: c.title, chapter: c.chapter, selectable: c.selectable, isActive: true },
        });
    }
    const { count: retired } = await prisma.diagnosisCode.updateMany({
        where: { codeSystem: 'ICD_10', isActive: true, code: { notIn: codes.map(c => c.code) } },
        data:  { isActive: false },
    });
    console.log(`✓ ICD-10: ${chapters.length} chapters, ${groups.length} groups, ${codes.length} codes (${added.length} added, ${changed.length} updated, ${retired} retired)`);
}

// ATC therapeutic groups, shared by every hospital (15 §3). Insert-only: re-running adds the groups that
// aren't there yet and leaves existing rows as they are, so it is safe to run any number of times.
async function seedTherapeuticUses() {
    const uses = parseTherapeuticUses(JSON.parse(readFileSync(join(__dirname, 'data', 'medicines', 'therapeutic-uses.json'), 'utf8')));

    const existing = new Set(
        (await prisma.therapeuticUse.findMany({ where: { atcCode: { not: null } }, select: { atcCode: true } })).map(u => u.atcCode),
    );
    const added = uses.filter(u => !existing.has(u.atcCode));

    for (let i = 0; i < added.length; i += 1000) {
        await prisma.therapeuticUse.createMany({ data: added.slice(i, i + 1000), skipDuplicates: true });
    }
    console.log(`✓ ${uses.length} therapeutic uses (${added.length} added, ${uses.length - added.length} already there)`);
}

async function main() {
    console.log('Seeding...');
    await seedDepartments();
    await seedAccessControl();
    await seedDiagnosisCodes();
    await seedTherapeuticUses();
    console.log('Done.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
