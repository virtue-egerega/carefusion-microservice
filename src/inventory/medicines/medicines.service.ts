import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateMedicineDto, UpdateMedicineDto } from '@shared/contracts/inventory';
import { medicineKey } from './medicines-file';
import {
    MedicineSource, medicineSource, medicineUpdateRefusal, mergeRefusal, sameMedicine, unknownUses, visibleMedicines,
} from './medicines.rules';

const CONFLICT = 'This medicine already exists (same generic name, strength, dosage form and route)';

export type MedicinesQuery = {
    search?:         string;
    therapeuticUse?: string;
    dosageForm?:     $Enums.DosageForm;
    route?:          $Enums.MedicineRoute;
    bodySystem?:     $Enums.MedicineBodySystem;
    legalCategory?:  $Enums.LegalCategory;
    status?:         $Enums.CatalogStatus;
    source?:         MedicineSource;
    limit:           number;
    offset:          number;
};

const withUses = {
    omit:    { searchText: true },
    include: { therapeuticUses: { select: { use: { select: { code: true, name: true } } } } },
} as const;

type Identity = { genericName: string; strength: string | null; dosageForm: string; route: string };
type MedicineWithUses = Identity & { organizationId: string | null; therapeuticUses: { use: { code: string; name: string } }[] };

/**
 * A medicine as the API returns it: `source` says where it came from, its uses are flat, and a hospital's
 * own medicine that CareFusion now seeds names that seeded medicine (`seededMatch`), so it can be merged.
 */
const toDoc = <T extends MedicineWithUses>({ therapeuticUses, ...medicine }: T, seeded: Map<string, string>) => {
    const match = medicine.organizationId ? seeded.get(medicineKey(medicine)) : undefined;
    return {
        ...medicine,
        source:          medicineSource(medicine.organizationId),
        therapeuticUses: therapeuticUses.map(({ use }) => use),
        seededMatch:     match ? { id: match } : null,
    };
};

/**
 * The medicine list (PRD 15 §3.1): rows seeded by CareFusion, plus medicines a hospital added itself
 * (USER_ADDED), visible only to that hospital. Hospitals can't change seeded rows.
 */
@Injectable()
export class MedicinesService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * A hospital's own medicine. Refused (409) if it matches a seeded medicine (checked here) or one of
     * its own (the Medicine_identity index); its uses must already exist.
     */
    async create(dto: CreateMedicineDto, organizationId: string, createdBy: string) {
        const client = this.databaseService.client;
        const { therapeuticUses: codes = [], ...fields } = dto;
        const dosageForm = fields.dosageForm as $Enums.DosageForm;
        const route = fields.route as $Enums.MedicineRoute;
        const [seeded, uses] = await client.$transaction([
            client.medicine.findFirst({
                where:  { organizationId: null, ...sameMedicine({ genericName: fields.genericName, strength: fields.strength, dosageForm, route }) },
                select: { id: true },
            }),
            client.therapeuticUse.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }),
        ]);
        if (seeded) throw new ConflictException(CONFLICT);
        this.assertUsesExist(codes, uses);

        const { id } = await withConstraintErrors(
            () => client.medicine.create({
                data: {
                    ...fields,
                    genericName:     fields.genericName.trim(),
                    strength:        fields.strength?.trim() || null,
                    dosageForm,
                    route,
                    bodySystems:     fields.bodySystems as $Enums.MedicineBodySystem[] | undefined,
                    legalCategory:   fields.legalCategory as $Enums.LegalCategory | undefined,
                    ingredients:     fields.ingredients ?? [fields.genericName.trim()],
                    organizationId,
                    createdBy,
                    therapeuticUses: { create: uses.map(use => ({ useId: use.id })) },
                },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Medicine added' };
    }

    /** Seeded medicines and the caller's own, by generic name, strength, form and route, each with its uses. */
    async findAll(organizationId: string, query: MedicinesQuery) {
        const client = this.databaseService.client;
        const where = {
            AND: [
                visibleMedicines(organizationId, query.source),
                {
                    ...(query.dosageForm && { dosageForm: query.dosageForm }),
                    ...(query.route && { route: query.route }),
                    ...(query.bodySystem && { bodySystems: { has: query.bodySystem } }),
                    ...(query.legalCategory && { legalCategory: query.legalCategory }),
                    ...(query.status && { status: query.status }),
                    ...(query.therapeuticUse && { therapeuticUses: { some: { use: { code: query.therapeuticUse } } } }),
                    // searchText is already lower case, and trigram-indexed for partial matches
                    ...(query.search && { searchText: { contains: query.search.toLowerCase() } }),
                },
            ],
        };

        const [count, medicines] = await client.$transaction([
            client.medicine.count({ where }),
            client.medicine.findMany({
                where,
                ...withUses,
                take:    query.limit,
                skip:    query.offset,
                orderBy: [{ genericName: 'asc' }, { strength: 'asc' }, { dosageForm: 'asc' }, { route: 'asc' }],
            }),
        ]);
        const seeded = await this.seededMatches(medicines);
        return { count, docs: medicines.map(medicine => toDoc(medicine, seeded)) };
    }

    /**
     * Catalogue figures for the medicines page (§18), over the medicines the caller sees, active only:
     * how many medicines, and how many different dosage forms, routes, legal categories and therapeutic
     * uses they cover. The queries run in parallel; a batched $transaction would lose groupBy's result types.
     */
    async stats(organizationId: string) {
        const client = this.databaseService.client;
        const visible = visibleMedicines(organizationId);
        const active = { AND: [visible, { status: 'ACTIVE' as const }] };

        const [total, inactive, userAdded, stocked, controlled, forms, routes, categories, uses] = await Promise.all([
            client.medicine.count({ where: active }),
            client.medicine.count({ where: { AND: [visible, { status: 'INACTIVE' as const }] } }),
            client.medicine.count({ where: { organizationId, status: 'ACTIVE' } }),
            client.medicine.count({ where: { AND: [...active.AND, { stockItems: { some: { organizationId } } }] } }),
            client.medicine.count({ where: { AND: [...active.AND, { controlled: true }] } }),
            client.medicine.groupBy({ by: ['dosageForm'], where: active }),
            client.medicine.groupBy({ by: ['route'], where: active }),
            client.medicine.groupBy({ by: ['legalCategory'], where: active }),
            client.medicineTherapeuticUse.groupBy({ by: ['useId'], where: { medicine: active } }),
        ]);

        return {
            total,
            inactive,
            userAdded,
            stocked,
            controlled,
            dosageForms:     forms.length,
            routes:          routes.length,
            legalCategories: categories.length,
            therapeuticUses: uses.length,
        };
    }

    /** One visible medicine with its uses and the organisation's products of it. */
    async findOne(medicineId: string, organizationId: string) {
        const medicine = await this.databaseService.client.medicine.findFirst({
            where:   { id: medicineId, ...visibleMedicines(organizationId) },
            omit:    withUses.omit,
            include: {
                ...withUses.include,
                stockItems: {
                    where:   { organizationId },
                    select:  {
                        brandName:    true,
                        manufacturer: { select: { id: true, name: true } },
                        item:         { select: { id: true, code: true, name: true, unit: true, status: true } },
                    },
                    orderBy: { item: { name: 'asc' } },
                },
            },
        });
        if (!medicine) throw new NotFoundException('Medicine not found');

        const { stockItems, ...rest } = medicine;
        return {
            ...toDoc(rest, await this.seededMatches([rest])),
            products: stockItems.map(({ item, ...product }) => ({ ...item, ...product })),
        };
    }

    /**
     * Edits one of the caller's own medicines. `therapeuticUses`, when given, replaces its uses. The
     * medicine is read first, since a new name, strength, form or route must also not match a seeded medicine.
     */
    async update(medicineId: string, dto: UpdateMedicineDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const { therapeuticUses: codes, ...fields } = dto;
        const [found, uses] = await client.$transaction([
            client.medicine.findFirst({
                where:  { id: medicineId, ...visibleMedicines(organizationId) },
                select: { organizationId: true, genericName: true, strength: true, dosageForm: true, route: true },
            }),
            client.therapeuticUse.findMany({ where: { code: { in: codes ?? [] } }, select: { id: true, code: true } }),
        ]);
        const refusal = medicineUpdateRefusal(found, organizationId);
        if (refusal) throw refusal.forbidden ? new ForbiddenException(refusal.reason) : new NotFoundException(refusal.reason);
        if (codes) this.assertUsesExist(codes, uses);

        if (fields.genericName || fields.strength !== undefined || fields.dosageForm || fields.route) {
            const seeded = await client.medicine.findFirst({
                where:  {
                    organizationId: null,
                    ...sameMedicine({
                        genericName: fields.genericName ?? found!.genericName,
                        strength:    fields.strength !== undefined ? fields.strength : found!.strength,
                        dosageForm:  (fields.dosageForm as $Enums.DosageForm | undefined) ?? found!.dosageForm,
                        route:       (fields.route as $Enums.MedicineRoute | undefined) ?? found!.route,
                    }),
                },
                select: { id: true },
            });
            if (seeded) throw new ConflictException(CONFLICT);
        }

        await withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                await tx.medicine.update({
                    where: { id: medicineId },
                    data:  {
                        ...fields,
                        genericName:   fields.genericName?.trim(),
                        strength:      fields.strength === undefined ? undefined : fields.strength.trim() || null,
                        dosageForm:    fields.dosageForm as $Enums.DosageForm | undefined,
                        route:         fields.route as $Enums.MedicineRoute | undefined,
                        bodySystems:   fields.bodySystems as $Enums.MedicineBodySystem[] | undefined,
                        legalCategory: fields.legalCategory as $Enums.LegalCategory | undefined,
                        status:        fields.status as $Enums.CatalogStatus | undefined,
                        updatedBy,
                    },
                });
                if (codes) {
                    await tx.medicineTherapeuticUse.deleteMany({ where: { medicineId } });
                    await tx.medicineTherapeuticUse.createMany({ data: uses.map(use => ({ medicineId, useId: use.id })) });
                }
            }),
            { conflict: CONFLICT },
        );
        return { message: 'Medicine updated' };
    }

    /**
     * Merges one of the hospital's own medicines into the seeded medicine CareFusion now lists (§3.1): its
     * products move to the seeded one and it becomes INACTIVE, together. Returns the seeded medicine's id.
     */
    async merge(medicineId: string, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const found = await client.medicine.findFirst({
            where:  { id: medicineId, ...visibleMedicines(organizationId) },
            select: { organizationId: true, status: true, genericName: true, strength: true, dosageForm: true, route: true },
        });
        const seededId = found?.organizationId ? (await this.seededMatches([found])).get(medicineKey(found)) : undefined;

        const refusal = mergeRefusal(found, organizationId, seededId ? { id: seededId } : null);
        if (refusal) {
            if (refusal.forbidden) throw new ForbiddenException(refusal.reason);
            throw refusal.reason === 'Medicine not found' ? new NotFoundException(refusal.reason) : new BadRequestException(refusal.reason);
        }

        const moved = await this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            // conditional, so two merges at once can't both run
            const { count } = await tx.medicine.updateMany({
                where: { id: medicineId, organizationId, status: 'ACTIVE' },
                data:  { status: 'INACTIVE', updatedBy },
            });
            if (!count) throw new BadRequestException('This medicine is inactive; it may already have been merged');
            const products = await tx.stockItem.updateMany({
                where: { medicineId, organizationId },
                data:  { medicineId: seededId, updatedBy },
            });
            return products.count;
        });
        return { id: seededId!, message: `Merged into the seeded medicine; ${moved} product(s) moved` };
    }

    /** Every therapeutic use by name, for the filter and the add-medicine form. A short list, so not paginated. */
    async findUses(search?: string) {
        const docs = await this.databaseService.client.therapeuticUse.findMany({
            where:   search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
            select:  { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
        });
        return { count: docs.length, docs };
    }

    /**
     * For a hospital's own medicines, the seeded medicine with the same identity, by medicineKey. One query
     * for the whole page, and none when the page has only seeded medicines.
     */
    private async seededMatches(medicines: (Identity & { organizationId: string | null })[]) {
        const own = medicines.filter(m => m.organizationId);
        if (!own.length) return new Map<string, string>();

        const seeded = await this.databaseService.client.medicine.findMany({
            where:  {
                organizationId: null,
                status:         'ACTIVE',
                OR:             own.map(m => sameMedicine(m as Identity & { dosageForm: $Enums.DosageForm; route: $Enums.MedicineRoute })),
            },
            select: { id: true, genericName: true, strength: true, dosageForm: true, route: true },
        });
        return new Map(seeded.map(m => [medicineKey(m), m.id]));
    }

    private assertUsesExist(codes: string[], found: { code: string }[]) {
        const unknown = unknownUses(codes, found);
        if (unknown.length) throw new BadRequestException(`Unknown therapeutic use(s): ${unknown.join(', ')}`);
    }
}
