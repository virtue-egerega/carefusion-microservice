import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { withStockChecks } from './stock-errors';
import { quantityRefusal, returnRefusal, unusableReason } from './stock.rules';

export type IssueInput = {
    organizationId: string;
    userId:         string;
    pharmacyUnitId: string;   // the unit it leaves from
    sourceType:     string;   // "Dispensing", "WardUsage"…
    sourceId:       string;   // the record it was taken out for
    lines:          { itemId: string; batchId: string; sellingUnitQuantity: number }[];   // the batch taken out
};

export type ReturnInput = Omit<IssueInput, 'lines'> & {
    lines: { batchId: string; sellingUnitQuantity: number }[];
};

/**
 * The issue contract (PRD 15 §12.3): how Dispensing, ward and theatre usage take stock out. The caller
 * names the batch each line was taken from; inventory never picks one (§12.1) and never charges.
 * No endpoint here: the Dispensing PRD wires these to its own records.
 */
@Injectable()
export class StockIssueService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Takes stock out, in one transaction. Every line's batch must be its product's and usable at the
     * unit, and its quantity whole or half as the product allows; every failing line is reported in one
     * 400. Taking more than the batch holds there is a 409, from the balance CHECK.
     */
    async issue(input: IssueInput) {
        const client = this.databaseService.client;
        const today = new Date();
        const batchIds = [...new Set(input.lines.map(l => l.batchId))];

        const [unit, batches] = await client.$transaction([
            client.pharmacyUnit.findFirst({ where: { id: input.pharmacyUnitId, organizationId: input.organizationId }, select: { branchId: true, status: true } }),
            client.stockBatch.findMany({
                where:  { id: { in: batchIds }, organizationId: input.organizationId },
                select: {
                    id: true, itemId: true, batchNumber: true, expiryDate: true, qualityStatus: true,
                    stockItem: { select: { sellableInHalves: true, item: { select: { status: true } } } },
                    balances:  {
                        where:  { pharmacyUnitId: input.pharmacyUnitId, status: $Enums.StockStatus.AVAILABLE },
                        select: { sellingUnitQuantity: true },
                    },
                },
            }),
        ]);
        if (!unit) throw new NotFoundException('Pharmacy unit not found');

        const problems = input.lines.flatMap((line, i) => {
            const batch = batches.find(b => b.id === line.batchId);
            if (!batch || batch.itemId !== line.itemId) return [`Line ${i + 1}: that batch isn't this product's`];
            const name = `Line ${i + 1} (batch ${batch.batchNumber ?? batch.id})`;
            const quantity = quantityRefusal(line.sellingUnitQuantity, batch.stockItem.sellableInHalves);
            if (quantity) return [`${name}: ${quantity}`];
            const held = Number(batch.balances[0]?.sellingUnitQuantity ?? 0);
            if (!held) return [`${name}: none of it is available in this unit`];
            const reason = unusableReason({
                status:        $Enums.StockStatus.AVAILABLE,
                qualityStatus: batch.qualityStatus,
                expiryDate:    batch.expiryDate,
                unitActive:    unit.status === $Enums.CatalogStatus.ACTIVE,
                itemActive:    batch.stockItem.item.status === $Enums.CatalogStatus.ACTIVE,
            }, today);
            return reason ? [`${name}: can't be issued, ${reason}`] : [];
        });
        if (problems.length) throw new BadRequestException(`Can't issue: ${problems.join('; ')}`);

        return withStockChecks(() => this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const { id: transactionId } = await tx.stockTransaction.create({
                data: {
                    organizationId: input.organizationId, branchId: unit.branchId, type: $Enums.StockTransactionType.ISSUE,
                    sourceType: input.sourceType, sourceId: input.sourceId, occurredAt: today, createdBy: input.userId,
                },
                select: { id: true },
            });
            await tx.stockMovement.createMany({
                data: input.lines.map(line => ({
                    transactionId,
                    organizationId:      input.organizationId,
                    pharmacyUnitId:      input.pharmacyUnitId,
                    itemId:              line.itemId,
                    batchId:             line.batchId,
                    status:              $Enums.StockStatus.AVAILABLE,
                    sellingUnitQuantity: -line.sellingUnitQuantity,
                })),
            });
            return { transactionId };
        }), 'Not enough stock in that batch in this unit');
    }

    /**
     * Brings unused stock back to the batches it was issued from, at the same unit, as ISSUE_RETURN.
     * Each batch takes back at most what was issued from it for the source, less what came back already.
     */
    async returnIssue(input: ReturnInput) {
        const client = this.databaseService.client;
        const source = { organizationId: input.organizationId, sourceType: input.sourceType, sourceId: input.sourceId };

        const [unit, moved] = await client.$transaction([
            client.pharmacyUnit.findFirst({ where: { id: input.pharmacyUnitId, organizationId: input.organizationId }, select: { branchId: true } }),
            client.stockMovement.findMany({
                where:  {
                    pharmacyUnitId: input.pharmacyUnitId,
                    transaction:    { ...source, type: { in: [$Enums.StockTransactionType.ISSUE, $Enums.StockTransactionType.ISSUE_RETURN] } },
                },
                select: { batchId: true, itemId: true, sellingUnitQuantity: true, transaction: { select: { type: true } } },
            }),
        ]);
        if (!unit) throw new NotFoundException('Pharmacy unit not found');

        const issued = new Map<string, number>();
        const returned = new Map<string, number>();
        for (const m of moved) {
            const totals = m.transaction.type === $Enums.StockTransactionType.ISSUE ? issued : returned;
            totals.set(m.batchId, (totals.get(m.batchId) ?? 0) + Math.abs(Number(m.sellingUnitQuantity)));
        }
        const refusal = returnRefusal(input.lines, issued, returned);
        if (refusal) throw new BadRequestException(refusal);

        return this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const { id: transactionId } = await tx.stockTransaction.create({
                data: { ...source, branchId: unit.branchId, type: $Enums.StockTransactionType.ISSUE_RETURN, occurredAt: new Date(), createdBy: input.userId },
                select: { id: true },
            });
            await tx.stockMovement.createMany({
                data: input.lines.map(line => ({
                    transactionId,
                    organizationId:      input.organizationId,
                    pharmacyUnitId:      input.pharmacyUnitId,
                    itemId:              moved.find(m => m.batchId === line.batchId)!.itemId,
                    batchId:             line.batchId,
                    status:              $Enums.StockStatus.AVAILABLE,
                    sellingUnitQuantity: line.sellingUnitQuantity,
                })),
            });
            return { transactionId };
        });
    }
}
