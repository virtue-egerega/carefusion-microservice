import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { BatchQualityDto } from '@shared/contracts/inventory';
import { batchCostPrice, qualityChangeRefusal, stockValue } from '../stock/stock.rules';
import { roundUpToKobo } from '../../billables/pricing/pricing.rules';

export type BatchesQuery = {
    itemId?:        string;
    batchNumber?:   string;
    qualityStatus?: $Enums.BatchQuality;
    expiresBefore?: Date;
    withStock?:     boolean;   // only batches still holding stock somewhere
    limit:          number;
    offset:         number;
};

const productSelect = { select: { item: { select: { id: true, code: true, name: true, sellingUnit: { select: { id: true, name: true, pluralName: true } } } } } };

/** Batches (PRD 15 §6, §14.3): a product's lots, where their stock is, and their quality. */
@Injectable()
export class BatchesService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** Soonest expiry first, each with its product and the selling units it holds per unit and status. */
    async findAll(organizationId: string, query: BatchesQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.itemId && { itemId: query.itemId }),
            ...(query.batchNumber && { batchNumber: { contains: query.batchNumber, mode: 'insensitive' as const } }),
            ...(query.qualityStatus && { qualityStatus: query.qualityStatus }),
            ...(query.expiresBefore && { expiryDate: { lt: query.expiresBefore } }),
            ...(query.withStock && { balances: { some: { sellingUnitQuantity: { gt: 0 } } } }),
        };

        const [count, docs] = await client.$transaction([
            client.stockBatch.count({ where }),
            client.stockBatch.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { firstReceivedAt: 'asc' }],
                include: {
                    stockItem: productSelect,
                    balances:  {
                        where:  { sellingUnitQuantity: { gt: 0 } },
                        select: { status: true, sellingUnitQuantity: true, pharmacyUnit: { select: { id: true, name: true } } },
                    },
                },
            }),
        ]);
        return { count, docs: docs.map(withQuantities) };
    }

    /**
     * One batch: where its stock is, the goods receipt items that brought it in, its latest movements,
     * and (with billable.cost.view) its cost price per selling unit and the value of what's left.
     */
    async findOne(batchId: string, organizationId: string, permissions: string[]) {
        const batch = await this.databaseService.client.stockBatch.findFirst({
            where:   { id: batchId, organizationId },
            include: {
                stockItem:    productSelect,
                balances:     {
                    where:  { sellingUnitQuantity: { gt: 0 } },
                    select: { status: true, sellingUnitQuantity: true, pharmacyUnit: { select: { id: true, name: true } } },
                },
                receiptItems: {
                    where:   { receipt: { status: $Enums.ReceiptStatus.POSTED } },
                    orderBy: { createdAt: 'asc' },
                    select:  {
                        id: true, purchaseUnitName: true, sellingUnitsPerPurchaseUnit: true, purchaseUnitsAccepted: true, purchaseUnitCost: true,
                        receipt: { select: { id: true, number: true, receivedAt: true, supplier: { select: { id: true, name: true } } } },
                    },
                },
                movements:    {
                    orderBy: { createdAt: 'desc' },
                    take:    50,
                    select:  {
                        id: true, status: true, sellingUnitQuantity: true, createdAt: true,
                        pharmacyUnit: { select: { id: true, name: true } },
                        transaction:  { select: { type: true, sourceType: true, sourceId: true } },
                    },
                },
            },
        });
        if (!batch) throw new NotFoundException('Batch not found');

        const shown = withQuantities(batch);
        if (!permissions.includes('billable.cost.view')) {
            return { ...shown, receiptItems: batch.receiptItems.map(({ purchaseUnitCost, ...item }) => item) };
        }
        const costPrice = batchCostPrice(batch.receiptItems);
        // shown rounded up (D14); the value is worked out from the exact cost
        return { ...shown, sellingUnitCostPrice: costPrice && roundUpToKobo(costPrice), value: stockValue(shown.sellingUnitQuantity, costPrice) };
    }

    /**
     * Holds, releases or recalls a batch (§14.3). It applies everywhere at once with no movement: held or
     * recalled stock simply stops being usable. Recalled is final. One conditional update.
     */
    async changeQuality(batchId: string, dto: BatchQualityDto, organizationId: string, userId: string) {
        const client = this.databaseService.client;
        const batch = await client.stockBatch.findFirst({ where: { id: batchId, organizationId }, select: { qualityStatus: true } });
        if (!batch) throw new NotFoundException('Batch not found');

        const refusal = qualityChangeRefusal(batch.qualityStatus, dto.qualityStatus, dto.recallReference);
        if (refusal) throw new BadRequestException(refusal);

        await client.stockBatch.update({
            where: { id: batchId },
            data:  {
                qualityStatus:    dto.qualityStatus as $Enums.BatchQuality,
                qualityReason:    dto.reason,
                qualityChangedAt: new Date(),
                qualityChangedBy: userId,
                ...(dto.qualityStatus === 'RECALLED' && { recallReference: dto.recallReference }),
            },
        });
        return { message: `Batch ${dto.qualityStatus === 'RECALLED' ? 'recalled' : dto.qualityStatus === 'ON_HOLD' ? 'put on hold' : 'released'}` };
    }
}

/** Decimal balances as numbers (whole or half, so exact), and the batch's total. */
function withQuantities<T extends { balances: { sellingUnitQuantity: { toString(): string } }[] }>(batch: T) {
    const balances = batch.balances.map(b => ({ ...b, sellingUnitQuantity: Number(b.sellingUnitQuantity) }));
    return { ...batch, balances, sellingUnitQuantity: balances.reduce((sum, b) => sum + b.sellingUnitQuantity, 0) };
}
