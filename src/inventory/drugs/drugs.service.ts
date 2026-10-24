import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateDrugDto, UpdateDrugDto } from '@shared/contracts/inventory';
import { drugUpdateRefusal, visibleDrugs } from './drugs.rules';

const CONFLICT = 'This drug already exists (same generic name, strength, form and route)';

export type DrugsQuery = {
    search?:     string;
    dosageForm?: $Enums.DosageForm;
    route?:      $Enums.DrugRoute;
    status?:     $Enums.CatalogStatus;
    source?:     'SYSTEM' | 'HOSPITAL';
    limit:       number;
    offset:      number;
};

/**
 * The drug list (PRD 15 §3.1): rows seeded by CareFusion, plus drugs a hospital added itself, visible
 * only to that hospital. Hospitals can't change system rows.
 */
@Injectable()
export class DrugsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** A hospital's own drug. The Drug_identity index rejects one that matches a system or own drug (409). */
    async create(dto: CreateDrugDto, organizationId: string, createdBy: string) {
        const { id } = await withConstraintErrors(
            () => this.databaseService.client.drug.create({
                data: {
                    ...dto,
                    dosageForm: dto.dosageForm as $Enums.DosageForm,
                    route:      dto.route as $Enums.DrugRoute,
                    organizationId,
                    createdBy,
                },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Drug added' };
    }

    /** System drugs and the caller's own, by generic name then strength; `source` says which each is. */
    async findAll(organizationId: string, query: DrugsQuery) {
        const client = this.databaseService.client;
        const where = {
            AND: [
                visibleDrugs(organizationId, query.source),
                {
                    ...(query.dosageForm && { dosageForm: query.dosageForm }),
                    ...(query.route && { route: query.route }),
                    ...(query.status && { status: query.status }),
                    ...(query.search && { genericName: { contains: query.search, mode: 'insensitive' as const } }),
                },
            ],
        };

        const [count, drugs] = await client.$transaction([
            client.drug.count({ where }),
            client.drug.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: [{ genericName: 'asc' }, { strength: 'asc' }],
            }),
        ]);
        return { count, docs: drugs.map(withSource) };
    }

    /** One visible drug with the organisation's products of it. */
    async findOne(drugId: string, organizationId: string) {
        const drug = await this.databaseService.client.drug.findFirst({
            where:   { id: drugId, ...visibleDrugs(organizationId) },
            include: {
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
        if (!drug) throw new NotFoundException('Drug not found');

        const { stockItems, ...rest } = drug;
        return {
            ...withSource(rest),
            products: stockItems.map(({ item, ...product }) => ({ ...item, ...product })),
        };
    }

    /** Only the caller's own drugs match; only when nothing matched is the drug read, to say why. */
    async update(drugId: string, dto: UpdateDrugDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const { count } = await withConstraintErrors(
            () => client.drug.updateMany({
                where: { id: drugId, organizationId },
                data:  {
                    ...dto,
                    dosageForm: dto.dosageForm as $Enums.DosageForm | undefined,
                    route:      dto.route as $Enums.DrugRoute | undefined,
                    status:     dto.status as $Enums.CatalogStatus | undefined,
                    updatedBy,
                },
            }),
            { conflict: CONFLICT },
        );

        if (!count) {
            const found = await client.drug.findFirst({ where: { id: drugId }, select: { organizationId: true } });
            const refusal = drugUpdateRefusal(found);
            throw refusal.forbidden ? new ForbiddenException(refusal.reason) : new NotFoundException(refusal.reason);
        }
        return { message: 'Drug updated' };
    }
}

const withSource = <T extends { organizationId: string | null }>(drug: T) => ({
    ...drug,
    source: drug.organizationId ? 'HOSPITAL' : 'SYSTEM',
});
