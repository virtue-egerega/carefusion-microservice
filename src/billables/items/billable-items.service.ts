import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { CreateBillableItemDto, UpdateBillableItemDto } from '@shared/contracts/billables';
import { inEffectAt, selfPayAmount } from '../pricing/pricing.rules';
import { itemUpdateRefusal, selfPayRefusal } from './items.rules';

export type CategoryItemsQuery = {
    status?: $Enums.CatalogStatus;
    search?: string;
    limit:   number;
    offset:  number;
};

type PriceLine = { id: string; basis: $Enums.PriceBasis; amount: Prisma.Decimal | null; percent: Prisma.Decimal | null; effectiveFrom: Date; reason: string };
type CostRow   = { id: string; packCost: Prisma.Decimal; unitsPerPack: number; effectiveFrom: Date; source: string | null };

/**
 * An item with its current self-pay price. The markup percent and cost reveal the hospital's
 * margin, so they're only included for holders of billable.cost.view (PRD 12 §10).
 */
function present<T extends object>(item: T, line: PriceLine | undefined, cost: CostRow | undefined, canSeeCost: boolean) {
    return {
        ...item,
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
    prices: { where: { payerId: null, ...inEffectAt(at) }, take: 1 },
    costs:  { where: inEffectAt(at), take: 1 },
});

const CODE_CONFLICT = 'An item with this code already exists';

/** Billable items (PRD 12 §4). Scoped to the caller's organisation. */
@Injectable()
export class BillableItemsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Creates the item with its self-pay line (and, for MARKUP, its first cost) in one nested write,
     * all effective from the same instant, so the item is never unpriceable (§4.2, D5).
     */
    async create(dto: CreateBillableItemDto, organizationId: string, createdBy: string, permissions: string[]) {
        const refusal = selfPayRefusal(dto.selfPay, permissions);
        if (refusal) throw refusal.forbidden ? new ForbiddenException(refusal.reason) : new BadRequestException(refusal.reason);

        const client = this.databaseService.client;
        // the category must be this organisation's and active (§3.2); an FK alone can't check either
        const category = await client.billableCategory.findFirst({
            where:  { id: dto.categoryId, organizationId },
            select: { status: true },
        });
        if (!category) throw new NotFoundException('Billable category not found');
        if (category.status !== $Enums.CatalogStatus.ACTIVE) throw new BadRequestException('This category is inactive');

        const { selfPay, reason, ...item } = dto;
        const effectiveFrom = new Date();
        const markup = selfPay.basis === 'MARKUP';

        const created = await withConstraintErrors(
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
                },
                include: {
                    category: { select: { id: true, name: true, kind: true } },
                    prices:   true,
                    costs:    true,
                },
            }),
            { conflict: CODE_CONFLICT },
        );

        const { prices: [line], costs: [cost], ...rest } = created;
        return present(rest, line, cost, permissions.includes('billable.cost.view'));
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

        const { count } = await withConstraintErrors(
            () => client.billableItem.updateMany({
                where: { id: itemId, organizationId, ...(targetKind && { category: { kind: targetKind } }) },
                data:  { ...dto, status: dto.status as $Enums.CatalogStatus | undefined, updatedBy },
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
}
