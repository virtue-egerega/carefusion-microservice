import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { CreateBillableItemDto, UpdateBillableItemDto } from '@shared/contracts/billables';
import { inEffectAt, selfPayAmount } from '../pricing/pricing.rules';
import { clinicChangeRefusal, itemUpdateRefusal, selfPayRefusal } from './items.rules';

export type CategoryItemsQuery = {
    status?: $Enums.CatalogStatus;
    search?: string;
    limit:   number;
    offset:  number;
};

type PriceLine = { id: string; basis: $Enums.PriceBasis; amount: Prisma.Decimal | null; percent: Prisma.Decimal | null; effectiveFrom: Date; reason: string };
type CostRow   = { id: string; packCost: Prisma.Decimal; unitsPerPack: number; effectiveFrom: Date; source: string | null };

type ClinicLink = { clinic: { id: string; name: string } };

/**
 * An item with its current self-pay price and clinics. The markup percent and cost reveal the
 * hospital's margin, so they're only included for holders of billable.cost.view (PRD 12 §10).
 */
function present<T extends { clinicLinks: ClinicLink[] }>(
    { clinicLinks, ...item }: T, line: PriceLine | undefined, cost: CostRow | undefined, canSeeCost: boolean,
) {
    return {
        ...item,
        clinics: clinicLinks.map(link => link.clinic),
        selfPayPrice: selfPayAmount(line, cost),
        selfPayLine: line && {
            id: line.id, basis: line.basis, amount: line.amount, effectiveFrom: line.effectiveFrom, reason: line.reason,
            ...(canSeeCost && { percent: line.percent }),
        },
        ...(canSeeCost && cost && { cost }),
    };
}

// at most one self-pay line and one cost are in effect at a time (exclusion constraints)
const currentSelfPay = (at: Date) => ({
    prices:      { where: { payerId: null, ...inEffectAt(at) }, take: 1 },
    costs:       { where: inEffectAt(at), take: 1 },
    clinicLinks: { select: { clinic: { select: { id: true, name: true } } }, orderBy: { clinic: { name: 'asc' as const } } },
});

const CODE_CONFLICT = 'An item with this code already exists';

/** Billable items (PRD 12 §4). Scoped to the caller's organisation. */
@Injectable()
export class BillableItemsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Creates the item with its self-pay line (and, for MARKUP, its first cost), effective now so the
     * item is never unpriceable (§4.2, D5), and its clinic links (§4.4): one nested write, so atomic.
     */
    async create(dto: CreateBillableItemDto, organizationId: string, createdBy: string, permissions: string[]) {
        const refusal = selfPayRefusal(dto.selfPay, permissions);
        if (refusal) throw refusal.forbidden ? new ForbiddenException(refusal.reason) : new BadRequestException(refusal.reason);

        const { selfPay, reason, clinicIds, ...item } = dto;
        const client = this.databaseService.client;

        // the category must be this organisation's and active (§3.2), and the clinics active (§4.4);
        // an FK can't check either. Both reads go in one round trip.
        const [category, activeClinics] = await client.$transaction([
            client.billableCategory.findFirst({ where: { id: item.categoryId, organizationId }, select: { status: true } }),
            client.clinic.count({ where: { id: { in: clinicIds ?? [] }, isActive: true } }),
        ]);
        if (!category) throw new NotFoundException('Billable category not found');
        if (category.status !== $Enums.CatalogStatus.ACTIVE) throw new BadRequestException('This category is inactive');
        if (activeClinics !== (clinicIds?.length ?? 0)) throw new BadRequestException('One or more clinics are unknown or inactive');

        const effectiveFrom = new Date();
        const markup = selfPay.basis === 'MARKUP';

        const { id } = await withConstraintErrors(
            () => client.billableItem.create({
                data: {
                    ...item,
                    organizationId,
                    createdBy,
                    prices: {
                        create: {
                            basis:   selfPay.basis as $Enums.PriceBasis,
                            amount:  markup ? null : selfPay.amount,
                            percent: markup ? selfPay.percent : null,
                            effectiveFrom,
                            reason,
                            createdBy,
                        },
                    },
                    ...(markup && {
                        costs: {
                            create: {
                                packCost:     selfPay.cost!.packCost,
                                unitsPerPack: selfPay.cost!.unitsPerPack ?? 1,
                                source:       selfPay.cost!.source,
                                effectiveFrom,
                                reason,
                                createdBy,
                            },
                        },
                    }),
                    // itemId and organizationId come from the item through the composite relation
                    ...(clinicIds?.length ? {
                        clinicLinks: { createMany: { data: clinicIds.map(clinicId => ({ clinicId, createdBy })) } },
                    } : {}),
                },
                select: { id: true },
            }),
            { conflict: CODE_CONFLICT },
        );
        return { id, message: 'Billable item created' };
    }

    /**
     * A category's items by name, paginated, each with its self-pay price in effect now. The category
     * is read in the same transaction, only to tell "no such category" (404) from "no items".
     */
    async findByCategory(categoryId: string, organizationId: string, query: CategoryItemsQuery, permissions: string[]) {
        const client = this.databaseService.client;
        const now = new Date();
        const where = {
            categoryId,
            organizationId,
            ...(query.status && { status: query.status }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' as const } },
                    { code: { contains: query.search, mode: 'insensitive' as const } },
                ],
            }),
        };

        const [category, count, items] = await client.$transaction([
            client.billableCategory.findFirst({ where: { id: categoryId, organizationId }, select: { id: true, name: true, kind: true, status: true } }),
            client.billableItem.count({ where }),
            client.billableItem.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { name: 'asc' },
                include: currentSelfPay(now),
            }),
        ]);
        if (!category) throw new NotFoundException('Billable category not found');

        const canSeeCost = permissions.includes('billable.cost.view');
        return {
            category,
            count,
            docs: items.map(({ prices: [line], costs: [cost], ...item }) => present(item, line, cost, canSeeCost)),
        };
    }

    /** One item with its category and the self-pay price in effect now. */
    async findOne(itemId: string, organizationId: string, permissions: string[]) {
        const item = await this.databaseService.client.billableItem.findFirst({
            where:   { id: itemId, organizationId },
            include: { category: { select: { id: true, name: true, kind: true, status: true } }, ...currentSelfPay(new Date()) },
        });
        if (!item) throw new NotFoundException('Billable item not found');
        const { prices: [line], costs: [cost], ...rest } = item;
        return present(rest, line, cost, permissions.includes('billable.cost.view'));
    }

    /**
     * Edits details, status, or moves the item to another category of the same kind (§4.2). The
     * same-kind rule is part of the update's condition; only when nothing matched is the item read, to say why.
     */
    async update(itemId: string, dto: UpdateBillableItemDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const clash = clinicChangeRefusal(dto.addClinicIds, dto.removeClinicIds);
        if (clash) throw new BadRequestException(clash.reason);
        await this.assertClinics(dto.addClinicIds);
        const { addClinicIds, removeClinicIds, ...fields } = dto;

        let targetKind: $Enums.ServiceCategory | null = null;
        if (dto.categoryId) {
            const target = await client.billableCategory.findFirst({
                where:  { id: dto.categoryId, organizationId },
                select: { kind: true, status: true },
            });
            if (!target) throw new NotFoundException('Billable category not found');
            if (target.status !== $Enums.CatalogStatus.ACTIVE) throw new BadRequestException('That category is inactive');
            targetKind = target.kind;
        }

        // links are written only if the item update matched, so a refused move changes nothing
        const count = await withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                const { count } = await tx.billableItem.updateMany({
                    where: { id: itemId, organizationId, ...(targetKind && { category: { kind: targetKind } }) },
                    data:  { ...fields, status: fields.status as $Enums.CatalogStatus | undefined, updatedBy },
                });
                if (!count) return 0;

                if (addClinicIds?.length) {
                    await tx.clinicBillableItem.createMany({
                        data:           addClinicIds.map(clinicId => ({ organizationId, clinicId, itemId, createdBy: updatedBy })),
                        skipDuplicates: true,
                    });
                }
                if (removeClinicIds?.length) {
                    await tx.clinicBillableItem.deleteMany({ where: { organizationId, itemId, clinicId: { in: removeClinicIds } } });
                }
                return count;
            }),
            { conflict: CODE_CONFLICT },
        );

        if (!count) {
            const found = await client.billableItem.findFirst({
                where:  { id: itemId, organizationId },
                select: { category: { select: { kind: true } } },
            });
            const { reason } = itemUpdateRefusal(found && { kind: found.category.kind }, targetKind);
            throw found ? new ConflictException(reason) : new NotFoundException(reason);
        }
        return { message: 'Billable item updated' };
    }

    /**
     * An item's clinic links, by clinic name. The item is read in the same transaction, only to tell
     * "no such item" (404) from "no clinics".
     */
    async findClinics(itemId: string, organizationId: string, page: { limit: number; offset: number }) {
        const client = this.databaseService.client;
        const where = { itemId, organizationId };

        const [item, count, links] = await client.$transaction([
            client.billableItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true } }),
            client.clinicBillableItem.count({ where }),
            client.clinicBillableItem.findMany({
                where,
                take:    page.limit,
                skip:    page.offset,
                orderBy: { clinic: { name: 'asc' } },
                select:  { createdAt: true, clinic: { select: { id: true, name: true, isActive: true } } },
            }),
        ]);
        if (!item) throw new NotFoundException('Billable item not found');

        return { count, docs: links.map(({ createdAt, clinic }) => ({ clinic, linkedAt: createdAt })) };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Every clinic to link must exist and be active (§4.4). One count, no rows loaded. */
    private async assertClinics(clinicIds?: string[]) {
        if (!clinicIds?.length) return;
        const found = await this.databaseService.client.clinic.count({ where: { id: { in: clinicIds }, isActive: true } });
        if (found !== clinicIds.length) throw new BadRequestException('One or more clinics are unknown or inactive');
    }
}
