import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { CreateBillableItemDto, CreatePriceLineDto, UpdateBillableItemDto } from '@shared/contracts/billables';
import { belowCostWarning, inEffectAt, resolvePrice, selfPayAmount, selfPayAndPayerLines, visiblePrice } from '../pricing/pricing.rules';
import { payerForPricing } from '../pricing/pricing.service';
import { PriceLineInput, clinicChangeRefusal, clinicPage, itemUpdateRefusal, priceLineRefusal, selfPayRefusal } from './items.rules';

export type CategoryItemsQuery = {
    status?: $Enums.CatalogStatus;
    search?: string;
    limit:   number;
    offset:  number;
};

type PriceLine = { id: string; basis: $Enums.PriceBasis; sellingUnitPrice: Prisma.Decimal | null; percent: Prisma.Decimal | null; effectiveFrom: Date; reason: string };
type CostRow   = { id: string; purchaseUnitCost: Prisma.Decimal; sellingUnitsPerPurchaseUnit: number; effectiveFrom: Date; source: string | null };

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
            id: line.id, basis: line.basis, sellingUnitPrice: line.sellingUnitPrice, effectiveFrom: line.effectiveFrom, reason: line.reason,
            ...(canSeeCost && { percent: line.percent }),
        },
        ...(canSeeCost && cost && { cost }),
    };
}

// at most one self-pay line and one cost are in effect at a time (exclusion constraints)
const currentSelfPay = (at: Date) => ({
    sellingPrices: { where: { payerId: null, ...inEffectAt(at) }, take: 1 },
    costPrices:    { where: inEffectAt(at), take: 1 },
    clinicLinks:   { select: { clinic: { select: { id: true, name: true } } }, orderBy: { clinic: { name: 'asc' as const } } },
});

export type ItemsQuery = CategoryItemsQuery & {
    categoryId?: string;
    kind?:       $Enums.ServiceCategory;
    clinicId?:   string;
    payerId?:    string;   // price each item for this payer; omitted = self-pay
};

const searchByNameOrCode = (search?: string) => search ? {
    OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { code: { contains: search, mode: 'insensitive' as const } },
    ],
} : {};

/** findAll's filters, without the clinic. */
const itemFilters = (organizationId: string, query: ItemsQuery) => ({
    organizationId,
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.kind && { category: { kind: query.kind } }),
    ...(query.status && { status: query.status }),
    ...searchByNameOrCode(query.search),
});

/** What pricing an item needs: its category, current self-pay line and cost, clinics, and the payer's line. */
const pricedInclude = (payerId: string | undefined, at: Date) => ({
    category: { select: { id: true, name: true, kind: true, status: true } },
    ...currentSelfPay(at),
    sellingPrices: { where: selfPayAndPayerLines(payerId, at), take: 2 },
});

type PricingPayer = { id: string; name: string; status: string; discounts: { id: string; percent: Prisma.Decimal }[] };

function assertPayer(payerId: string | undefined, payer: PricingPayer | null) {
    if (payerId && !payer) throw new NotFoundException('Payer not found');
    if (payer && payer.status !== 'ACTIVE') throw new BadRequestException(`${payer.name} is inactive`);
}

/** An item as listed: present() plus `price` for the payer (§9.1), or `priceError` when it can't be priced. */
function pricedDoc<T extends {
    id: string; name: string; status: string; category: { kind: string; status: string };
    sellingPrices: (PriceLine & { payerId: string | null; agreementId: string | null })[]; costPrices: CostRow[]; clinicLinks: ClinicLink[];
}>({ sellingPrices, costPrices, ...item }: T, payer: PricingPayer | null, canSeeCost: boolean) {
    const selfPayLine = sellingPrices.find(line => line.payerId === null);
    const price = resolvePrice({
        item:      { ...item, sellingPrices: selfPayLine ? [selfPayLine] : [], costPrices },
        payer:     payer ?? undefined,
        payerLine: sellingPrices.find(line => line.payerId !== null),
        discount:  payer?.discounts[0],
    });
    return {
        ...present(item, selfPayLine, costPrices[0], canSeeCost),
        price:      typeof price === 'string' ? null : visiblePrice(price, canSeeCost),
        priceError: typeof price === 'string' ? price : null,
    };
}

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
                    sellingPrices: {
                        create: {
                            basis:            selfPay.basis as $Enums.PriceBasis,
                            sellingUnitPrice: markup ? null : selfPay.sellingUnitPrice,
                            percent:          markup ? selfPay.percent : null,
                            effectiveFrom,
                            reason,
                            createdBy,
                        },
                    },
                    ...(markup && {
                        costPrices: {
                            create: {
                                purchaseUnitCost:            selfPay.cost!.purchaseUnitCost,
                                sellingUnitsPerPurchaseUnit: selfPay.cost!.sellingUnitsPerPurchaseUnit ?? 1,
                                source:                      selfPay.cost!.source,
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
     * A new price line for the item (PRD 12 §6.3): starts now or later, never in the past. The line open
     * for the same (item, payer) is closed where the new one starts; a line already scheduled after it
     * must be withdrawn first. A stocked item's self-pay price below its cost price per selling unit is
     * created with a `warning` (PRD 15 §11). One transaction; the exclusion constraint is the backstop.
     */
    async addPriceLine(itemId: string, dto: CreatePriceLineDto, organizationId: string, createdBy: string) {
        const refusal = priceLineRefusal(dto as PriceLineInput);
        if (refusal) throw new BadRequestException(refusal);

        const now = new Date();
        const effectiveFrom = dto.effectiveFrom ?? now;
        // a minute's grace for clock skew between the client and the server
        if (effectiveFrom.getTime() < now.getTime() - 60_000) throw new BadRequestException("A price line can't start in the past");
        const payerId = dto.payerId ?? null;

        return withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                const [item, payer, scheduled] = await Promise.all([
                    tx.billableItem.findFirst({
                        where:  { id: itemId, organizationId },
                        select: {
                            sellingUnit: true,
                            stockItem:   { select: { itemId: true } },
                            costPrices:  { where: inEffectAt(effectiveFrom), take: 1, select: { purchaseUnitCost: true, sellingUnitsPerPurchaseUnit: true } },
                        },
                    }),
                    payerId ? tx.payer.findFirst({ where: { id: payerId, organizationId }, select: { id: true } }) : null,
                    tx.itemSellingPrice.findFirst({
                        where:  { itemId, payerId, cancelledAt: null, effectiveFrom: { gt: effectiveFrom } },
                        select: { effectiveFrom: true },
                    }),
                ]);
                if (!item) throw new NotFoundException('Billable item not found');
                if (payerId && !payer) throw new NotFoundException('Payer not found');
                if (scheduled) {
                    throw new ConflictException(`A line is already scheduled from ${scheduled.effectiveFrom.toISOString()}; withdraw it first`);
                }

                await tx.itemSellingPrice.updateMany({
                    where: { itemId, payerId, ...inEffectAt(effectiveFrom) },
                    data:  { effectiveTo: effectiveFrom },
                });
                const { id } = await tx.itemSellingPrice.create({
                    data: {
                        itemId,
                        payerId,
                        basis:            dto.basis as $Enums.PriceBasis,
                        sellingUnitPrice: dto.sellingUnitPrice,
                        percent:          dto.percent,
                        agreementId:      dto.agreementId,
                        effectiveFrom,
                        reason:           dto.reason,
                        createdBy,
                    },
                    select: { id: true },
                });

                const warning = !payerId && dto.basis === 'MANUAL' && item.stockItem
                    ? belowCostWarning(dto.sellingUnitPrice!, item.costPrices[0], item.sellingUnit)
                    : null;
                return { id, message: 'Price line added', ...(warning && { warning }) };
            }),
            // the agreement FK is composite with the payer, so a wrong agreement fails it
            { notFound: "Payer agreement not found for this payer" },
        );
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
            ...searchByNameOrCode(query.search),
        };

        const [category, count, items] = await client.$transaction([
            client.billableCategory.findFirst({ where: { id: categoryId, organizationId }, select: { id: true } }),
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
            count,
            docs: items.map(({ sellingPrices: [line], costPrices: [cost], ...item }) => present(item, line, cost, canSeeCost)),
        };
    }

    /**
     * The organisation's items by name, paginated, for search pickers (registration, encounter
     * start), each with its category, its self-pay price, and `price`: its current price for
     * `payerId` (or self-pay), by §9.1. An item that can't be priced (inactive, no price) gets
     * `price: null` and `priceError` saying why, so one bad item doesn't fail the search. The
     * items, their lines and the payer are read in one round trip.
     */
    async findAll(organizationId: string, query: ItemsQuery, permissions: string[]) {
        const client = this.databaseService.client;
        const now = new Date();
        const where = {
            ...itemFilters(organizationId, query),
            ...(query.clinicId && { clinicLinks: { some: { clinicId: query.clinicId } } }),
        };

        const [count, items, payer] = await client.$transaction([
            client.billableItem.count({ where }),
            client.billableItem.findMany({ where, take: query.limit, skip: query.offset, orderBy: { name: 'asc' }, include: pricedInclude(query.payerId, now) }),
            client.payer.findFirst({ where: { id: query.payerId ?? '', organizationId }, select: payerForPricing(now) }),
        ]);
        assertPayer(query.payerId, payer);

        const canSeeCost = permissions.includes('billable.cost.view');
        return { count, docs: items.map(item => pricedDoc(item, payer, canSeeCost)) };
    }

    /**
     * Items for a clinic (PRD 12 §4.4): the same search as findAll, with the items linked to the
     * clinic first, then the rest, each by name, and `clinicMatch` on each. `kind` defaults to
     * CONSULTATION. When nothing is linked, no item has `clinicMatch` and staff pick. Counts first
     * (to know where the linked items end), then the page: two round trips.
     */
    async findForClinic(organizationId: string, clinicId: string, query: ItemsQuery, permissions: string[]) {
        const client = this.databaseService.client;
        const now = new Date();
        const base = itemFilters(organizationId, { ...query, kind: query.kind ?? $Enums.ServiceCategory.CONSULTATION });
        const linkedWhere = { ...base, clinicLinks: { some: { clinicId } } };
        const otherWhere  = { ...base, clinicLinks: { none: { clinicId } } };

        const [clinic, linkedCount, otherCount, payer] = await client.$transaction([
            client.clinic.findFirst({ where: { id: clinicId, isActive: true }, select: { id: true } }),
            client.billableItem.count({ where: linkedWhere }),
            client.billableItem.count({ where: otherWhere }),
            client.payer.findFirst({ where: { id: query.payerId ?? '', organizationId }, select: payerForPricing(now) }),
        ]);
        if (!clinic) throw new NotFoundException('Clinic not found or not active');
        assertPayer(query.payerId, payer);

        // the page runs through the linked items, then on into the rest
        const page = clinicPage(linkedCount, query.offset, query.limit);
        const include = pricedInclude(query.payerId, now);
        const [linked, others] = await client.$transaction([
            client.billableItem.findMany({ where: linkedWhere, skip: page.linked.skip, take: page.linked.take, orderBy: { name: 'asc' }, include }),
            client.billableItem.findMany({ where: otherWhere,  skip: page.others.skip, take: page.others.take, orderBy: { name: 'asc' }, include }),
        ]);

        const canSeeCost = permissions.includes('billable.cost.view');
        return {
            count: linkedCount + otherCount,
            docs: [
                ...linked.map(item => ({ ...pricedDoc(item, payer, canSeeCost), clinicMatch: true })),
                ...others.map(item => ({ ...pricedDoc(item, payer, canSeeCost), clinicMatch: false })),
            ],
        };
    }

    /** One item with its category and the self-pay price in effect now. */
    async findOne(itemId: string, organizationId: string, permissions: string[]) {
        const item = await this.databaseService.client.billableItem.findFirst({
            where:   { id: itemId, organizationId },
            include: { category: { select: { id: true, name: true, kind: true, status: true } }, ...currentSelfPay(new Date()) },
        });
        if (!item) throw new NotFoundException('Billable item not found');
        const { sellingPrices: [line], costPrices: [cost], ...rest } = item;
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
                    where: {
                        id: itemId, organizationId,
                        ...(targetKind && { category: { kind: targetKind } }),
                        // stock is counted in the selling unit, so it's locked once a batch exists (PRD 15 §3.4)
                        ...(fields.sellingUnit !== undefined && {
                            OR: [{ sellingUnit: fields.sellingUnit }, { stockItem: { is: null } }, { stockItem: { batches: { none: {} } } }],
                        }),
                    },
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
                select: { sellingUnit: true, category: { select: { kind: true } }, stockItem: { select: { _count: { select: { batches: true } } } } },
            });
            const { reason } = itemUpdateRefusal(
                found && { kind: found.category.kind, sellingUnit: found.sellingUnit, hasStock: (found.stockItem?._count.batches ?? 0) > 0 },
                targetKind,
                fields.sellingUnit,
            );
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
