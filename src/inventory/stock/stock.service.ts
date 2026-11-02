import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { StatusChangeDto } from '@shared/contracts/inventory';
import { withStockChecks } from './stock-errors';
import { batchCostPrice, expiryGroup, fefoOrder, quantityRefusal, statusChangeRefusal, stockValue, unusableReason } from './stock.rules';

export type StockScope = { pharmacyUnitId?: string; branchId?: string };

export type MovementsQuery = StockScope & {
    itemId?:  string;
    batchId?: string;
    type?:    $Enums.StockTransactionType;
    from?:    Date;
    to?:      Date;
    limit:    number;
    offset:   number;
};

const scopeWhere = (scope: StockScope) => ({
    ...(scope.pharmacyUnitId && { pharmacyUnitId: scope.pharmacyUnitId }),
    ...(scope.branchId && { branchId: scope.branchId }),
});

const canSeeCost = (permissions: string[]) => permissions.includes('billable.cost.view');

/** Goods receipt items that brought batches in, from posted receipts: what each batch cost (§9.3). */
const costedReceiptItems = { where: { receipt: { status: $Enums.ReceiptStatus.POSTED } }, select: { purchaseUnitCost: true, purchaseUnitsAccepted: true, sellingUnitsPerPurchaseUnit: true } };

/**
 * What stock there is and where (PRD 15 §8, §12.2): one product's balances, expiring stock, the ledger,
 * and status changes at a unit. Usable batches are listed in FEFO order, soonest expiry first, so staff
 * know what to take out first; the pharmacy always names the batch it takes (§12.1).
 */
@Injectable()
export class StockService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * One product's stock by pharmacy unit × batch × status: whether each row is usable (and why not),
     * usable rows first in FEFO order, totals, and values with billable.cost.view.
     */
    async itemStock(itemId: string, organizationId: string, scope: StockScope, permissions: string[]) {
        const client = this.databaseService.client;
        const today = new Date();
        const withCost = canSeeCost(permissions);

        const [product, balances] = await client.$transaction([
            client.stockItem.findFirst({
                where:  { itemId, organizationId },
                select: { sellableInHalves: true, shelfNumber: true, item: { select: { id: true, code: true, name: true, sellingUnit: true, status: true } } },
            }),
            client.stockBalance.findMany({
                where:   { organizationId, itemId, sellingUnitQuantity: { gt: 0 }, ...scopeWhere(scope) },
                include: {
                    pharmacyUnit: { select: { id: true, name: true, type: true, status: true } },
                    batch:        {
                        select: {
                            id: true, batchNumber: true, expiryDate: true, qualityStatus: true, firstReceivedAt: true,
                            ...(withCost && { receiptItems: costedReceiptItems }),
                        },
                    },
                },
            }),
        ]);
        if (!product) throw new NotFoundException('Stocked product not found');

        const rows = balances.map(b => {
            const reason = unusableReason({
                status:        b.status,
                qualityStatus: b.batch.qualityStatus,
                expiryDate:    b.batch.expiryDate,
                unitActive:    b.pharmacyUnit.status === $Enums.CatalogStatus.ACTIVE,
                itemActive:    product.item.status === $Enums.CatalogStatus.ACTIVE,
            }, today);
            const { receiptItems, ...batch } = b.batch as typeof b.batch & { receiptItems?: Parameters<typeof batchCostPrice>[0] };
            return {
                batchId:             b.batchId,
                expiryDate:          b.batch.expiryDate,
                firstReceivedAt:     b.batch.firstReceivedAt,
                pharmacyUnit:        b.pharmacyUnit,
                batch,
                status:              b.status,
                sellingUnitQuantity: Number(b.sellingUnitQuantity),
                usable:              !reason,
                unusableReason:      reason,
                ...(withCost && { value: stockValue(b.sellingUnitQuantity, batchCostPrice(receiptItems ?? [])) }),
            };
        });
        const usable = fefoOrder(rows.filter(r => r.usable));
        const unusable = rows.filter(r => !r.usable);
        const sum = (list: typeof rows) => list.reduce((total, r) => total + r.sellingUnitQuantity, 0);

        return {
            product: { ...product.item, sellableInHalves: product.sellableInHalves, shelfNumber: product.shelfNumber },
            totals:  {
                onHand:     sum(rows),
                usable:     sum(usable),
                quarantine: sum(rows.filter(r => r.status === $Enums.StockStatus.QUARANTINE)),
                damaged:    sum(rows.filter(r => r.status === $Enums.StockStatus.DAMAGED)),
                expired:    sum(unusable.filter(r => r.unusableReason === 'the batch is expired')),
                onHoldOrRecalled: sum(unusable.filter(r => r.batch.qualityStatus !== $Enums.BatchQuality.RELEASED)),
            },
            // usable first, soonest expiry first: what to take out first
            docs: [...usable, ...unusable].map(({ batchId, expiryDate, firstReceivedAt, ...row }) => row),
        };
    }

    /**
     * Batches with stock that are expired or expire within the window (§12.2): `withinDays`, else the
     * organisation's nearExpiryDays. Each with its product, group and quantities per unit; soonest first.
     */
    async expiry(organizationId: string, scope: StockScope & { withinDays?: number }, permissions: string[]) {
        const client = this.databaseService.client;
        const today = new Date();
        const withCost = canSeeCost(permissions);

        const organization = await client.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { nearExpiryDays: true } });
        const windowDays = scope.withinDays ?? organization.nearExpiryDays;
        const limit = new Date(today.getTime() + windowDays * 86_400_000);

        const balances = await client.stockBalance.findMany({
            where:   { organizationId, sellingUnitQuantity: { gt: 0 }, ...scopeWhere(scope), batch: { expiryDate: { lte: limit } } },
            orderBy: [{ batch: { expiryDate: 'asc' } }],
            include: {
                pharmacyUnit: { select: { id: true, name: true } },
                batch:        {
                    select: {
                        id: true, batchNumber: true, expiryDate: true, qualityStatus: true,
                        stockItem: { select: { item: { select: { id: true, code: true, name: true, sellingUnit: true } } } },
                        ...(withCost && { receiptItems: costedReceiptItems }),
                    },
                },
            },
        });

        // one entry per batch, with its quantity in each unit
        const byBatch = new Map<string, {
            batch: { id: string; batchNumber: string | null; expiryDate: Date | null; qualityStatus: $Enums.BatchQuality };
            product: { id: string; code: string; name: string; sellingUnit: string };
            group: 'EXPIRED' | 'EXPIRING';
            sellingUnitQuantity: number;
            units: { pharmacyUnit: { id: string; name: string }; status: $Enums.StockStatus; sellingUnitQuantity: number }[];
            costPrice: ReturnType<typeof batchCostPrice>;
        }>();
        for (const b of balances) {
            const { stockItem, receiptItems, ...batch } = b.batch as typeof b.batch & { receiptItems?: Parameters<typeof batchCostPrice>[0] };
            const entry = byBatch.get(b.batchId) ?? {
                batch,
                product:             stockItem.item,
                group:               expiryGroup(b.batch.expiryDate, today, windowDays)!,
                sellingUnitQuantity: 0,
                units:               [],
                costPrice:           withCost ? batchCostPrice(receiptItems ?? []) : null,
            };
            entry.sellingUnitQuantity += Number(b.sellingUnitQuantity);
            entry.units.push({ pharmacyUnit: b.pharmacyUnit, status: b.status, sellingUnitQuantity: Number(b.sellingUnitQuantity) });
            byBatch.set(b.batchId, entry);
        }
        const docs = [...byBatch.values()].map(({ costPrice, ...entry }) => ({
            ...entry,
            ...(withCost && { value: stockValue(entry.sellingUnitQuantity, costPrice) }),
        }));
        return { windowDays, count: docs.length, docs };
    }

    /** The stock ledger, newest first: each movement with its transaction, batch and unit. */
    async movements(organizationId: string, query: MovementsQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.pharmacyUnitId && { pharmacyUnitId: query.pharmacyUnitId }),
            ...(query.branchId && { pharmacyUnit: { branchId: query.branchId } }),
            ...(query.itemId && { itemId: query.itemId }),
            ...(query.batchId && { batchId: query.batchId }),
            ...(query.type && { transaction: { type: query.type } }),
            ...((query.from || query.to) && { createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lt: query.to }) } }),
        };

        const [count, docs] = await client.$transaction([
            client.stockMovement.count({ where }),
            client.stockMovement.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { createdAt: 'desc' },
                include: {
                    transaction:  { select: { id: true, type: true, sourceType: true, sourceId: true, reason: true, occurredAt: true, createdBy: true } },
                    batch:        { select: { id: true, batchNumber: true, expiryDate: true } },
                    pharmacyUnit: { select: { id: true, name: true } },
                },
            }),
        ]);
        return { count, docs: docs.map(m => ({ ...m, sellingUnitQuantity: Number(m.sellingUnitQuantity) })) };
    }

    /**
     * Moves stock between statuses at one unit (§8.3): release from quarantine, pull back to quarantine,
     * set aside as damaged. One STATUS_CHANGE transaction, a −from and +to movement per line, so the
     * total never changes. Every problem is reported in one 400; taking more than is there is a 409.
     */
    async changeStatus(dto: StatusChangeDto, organizationId: string, userId: string, permissions: string[]) {
        for (const line of dto.lines) {
            const refusal = statusChangeRefusal(line.from, line.to, permissions);
            if (refusal) throw refusal.forbidden ? new ForbiddenException(refusal.reason) : new BadRequestException(refusal.reason);
        }

        const client = this.databaseService.client;
        const batchIds = [...new Set(dto.lines.map(l => l.batchId))];
        const [unit, batches] = await client.$transaction([
            client.pharmacyUnit.findFirst({ where: { id: dto.pharmacyUnitId, organizationId, status: $Enums.CatalogStatus.ACTIVE }, select: { branchId: true } }),
            client.stockBatch.findMany({
                where:  { id: { in: batchIds }, organizationId },
                select: { id: true, batchNumber: true, itemId: true, stockItem: { select: { sellableInHalves: true } } },
            }),
        ]);
        if (!unit) throw new NotFoundException('Pharmacy unit not found or inactive');

        const problems = dto.lines.flatMap((line, i) => {
            const batch = batches.find(b => b.id === line.batchId);
            if (!batch) return [`Line ${i + 1}: batch not found`];
            const refusal = quantityRefusal(line.sellingUnitQuantity, batch.stockItem.sellableInHalves);
            return refusal ? [`Line ${i + 1} (batch ${batch.batchNumber ?? batch.id}): ${refusal}`] : [];
        });
        if (problems.length) throw new BadRequestException(`Can't change status: ${problems.join('; ')}`);

        return withStockChecks(() => this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const { id: transactionId } = await tx.stockTransaction.create({
                data: {
                    organizationId, branchId: unit.branchId, type: $Enums.StockTransactionType.STATUS_CHANGE,
                    reason: dto.reason, occurredAt: new Date(), createdBy: userId,
                },
                select: { id: true },
            });
            await tx.stockMovement.createMany({
                data: dto.lines.flatMap(line => {
                    const batch = batches.find(b => b.id === line.batchId)!;
                    const base = { transactionId, organizationId, pharmacyUnitId: dto.pharmacyUnitId, itemId: batch.itemId, batchId: batch.id };
                    return [
                        { ...base, status: line.from as $Enums.StockStatus, sellingUnitQuantity: -line.sellingUnitQuantity },
                        { ...base, status: line.to as $Enums.StockStatus, sellingUnitQuantity: line.sellingUnitQuantity },
                    ];
                }),
            });
            return { id: transactionId, message: 'Stock status changed' };
        }), "There isn't that much stock in that status here");
    }
}
