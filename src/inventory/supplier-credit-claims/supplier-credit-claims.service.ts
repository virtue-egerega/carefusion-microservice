import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { SettleSupplierClaimDto } from '@shared/contracts/inventory';
import { Actor, loadActors } from '../../billables/actors';
import { claimChangeRefusal, claimSettlementRefusal, replacementReceiptRefusal } from './supplier-credit-claims.rules';

export type SupplierCreditClaimsQuery = {
    supplierId?: string;
    status?:     $Enums.SupplierClaimStatus;
    branchId?:   string;
    from?:       Date;   // recorded (posted) from (inclusive)
    to?:         Date;   // recorded before (exclusive)
    limit:       number;
    offset:      number;
};

const NOT_FOUND = 'Supplier credit claim not found';

/** The line a claim came from, as claims show it: its receipt and product. */
const claimLine = {
    select: {
        id: true, purchaseUnitName: true, purchaseUnitsDelivered: true, purchaseUnitsAccepted: true, invoiceLineTotal: true,
        receipt:   { select: { id: true, number: true, receivedAt: true, supplierInvoiceNo: true } },
        stockItem: { select: { item: { select: { id: true, code: true, name: true } } } },
    },
};

/** A staff member as claims show them, from the users loadActors found; null if unset or unknown. */
const staffOf = (actors: Map<string, Actor>) => (userId: string | null) => {
    const actor = userId ? actors.get(userId) : undefined;
    return actor ? { id: actor.id, firstName: actor.firstName, lastName: actor.lastName } : null;
};

/**
 * What suppliers owe the hospital (PRD 15 §10.5): goods paid for on an invoice and handed back. Posting a goods
 * receipt records the claims; here they are followed up, settled or waived.
 */
@Injectable()
export class SupplierCreditClaimsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** Oldest first, so what has been owed longest is chased first. */
    async findAll(organizationId: string, query: SupplierCreditClaimsQuery) {
        const client = this.databaseService.client;
        const where = this.where(organizationId, query);
        const [count, docs] = await client.$transaction([
            client.supplierCreditClaim.count({ where }),
            client.supplierCreditClaim.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { createdAt: 'asc' },
                include: { supplier: { select: { id: true, name: true } }, goodsReceiptItem: claimLine },
            }),
        ]);
        return { count, docs };
    }

    /** How many claims are in each status, and how much is still owed, for the same filters as the list. One grouped query. */
    async metrics(organizationId: string, query: Pick<SupplierCreditClaimsQuery, 'supplierId' | 'branchId'>) {
        const groups = await this.databaseService.client.supplierCreditClaim.groupBy({
            by:     ['status'],
            where:  this.where(organizationId, query),
            _count: { _all: true },
            _sum:   { amountOwed: true },
        });
        const byStatus = Object.fromEntries(Object.values($Enums.SupplierClaimStatus).map(status => [status, 0])) as Record<$Enums.SupplierClaimStatus, number>;
        for (const group of groups) byStatus[group.status] = group._count._all;
        const outstanding = groups.find(g => g.status === $Enums.SupplierClaimStatus.OUTSTANDING);
        return { byStatus, amountOutstanding: outstanding?._sum.amountOwed ?? new Prisma.Decimal(0) };
    }

    /** One claim: the line and receipt it came from, the replacement receipt if any, and every person on it. */
    async findOne(claimId: string, organizationId: string) {
        const claim = await this.databaseService.client.supplierCreditClaim.findFirst({
            where:   { id: claimId, organizationId },
            include: {
                supplier:                { select: { id: true, name: true, phone: true, email: true } },
                goodsReceiptItem:        claimLine,
                replacementGoodsReceipt: { select: { id: true, number: true, receivedAt: true } },
            },
        });
        if (!claim) throw new NotFoundException(NOT_FOUND);

        const staff = staffOf(await loadActors(this.databaseService, [claim.createdBy, claim.settledBy, claim.waivedBy]));
        return { ...claim, createdBy: staff(claim.createdBy), settledBy: staff(claim.settledBy), waivedBy: staff(claim.waivedBy) };
    }

    /**
     * The supplier made it good: by credit note, refund, or the goods delivered again on a later posted receipt from
     * them. Final; one conditional update, so a claim is settled once.
     */
    async settle(claimId: string, dto: SettleSupplierClaimDto, organizationId: string, settledBy: string) {
        const refusal = claimSettlementRefusal(dto);
        if (refusal) throw new BadRequestException(refusal);

        const client = this.databaseService.client;
        const claim = await this.outstanding(claimId, organizationId);
        if (dto.replacementGoodsReceiptId) {
            const receipt = await client.goodsReceipt.findFirst({
                where:  { id: dto.replacementGoodsReceiptId, organizationId },
                select: { id: true, type: true, status: true, supplierId: true },
            });
            const replacementRefusal = replacementReceiptRefusal({ supplierId: claim.supplierId, goodsReceiptId: claim.goodsReceiptItem.receiptId }, receipt);
            if (replacementRefusal) throw new BadRequestException(replacementRefusal);
        }

        await this.change(claimId, {
            status:                    $Enums.SupplierClaimStatus.SETTLED,
            settledAs:                 dto.settledAs as $Enums.SupplierClaimSettlement,
            settlementReference:       dto.settlementReference,
            replacementGoodsReceiptId: dto.replacementGoodsReceiptId,
            settledAt:                 new Date(),
            settledBy,
        });
        return { id: claimId, message: 'Claim settled' };
    }

    /** The hospital writes the claim off, with a reason. Final. */
    async waive(claimId: string, reason: string, organizationId: string, waivedBy: string) {
        await this.outstanding(claimId, organizationId);
        await this.change(claimId, { status: $Enums.SupplierClaimStatus.WAIVED, waiveReason: reason, waivedAt: new Date(), waivedBy });
        return { id: claimId, message: 'Claim waived' };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private where(organizationId: string, query: Partial<SupplierCreditClaimsQuery>): Prisma.SupplierCreditClaimWhereInput {
        return {
            organizationId,
            ...(query.supplierId && { supplierId: query.supplierId }),
            ...(query.status && { status: query.status }),
            ...(query.branchId && { branchId: query.branchId }),
            ...((query.from || query.to) && { createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lt: query.to }) } }),
        };
    }

    /** The claim, if it's the hospital's and still outstanding: 404 if missing, 409 if already settled or waived. */
    private async outstanding(claimId: string, organizationId: string) {
        const claim = await this.databaseService.client.supplierCreditClaim.findFirst({
            where:  { id: claimId, organizationId },
            select: { status: true, supplierId: true, goodsReceiptItem: { select: { receiptId: true } } },
        });
        if (!claim) throw new NotFoundException(NOT_FOUND);
        const refusal = claimChangeRefusal(claim.status);
        if (refusal) throw new ConflictException(refusal);
        return claim;
    }

    /** Settles or waives the claim only if it's still outstanding, so two people can't both close it. */
    private async change(claimId: string, data: Prisma.SupplierCreditClaimUncheckedUpdateManyInput) {
        const { count } = await this.databaseService.client.supplierCreditClaim.updateMany({
            where: { id: claimId, status: $Enums.SupplierClaimStatus.OUTSTANDING },
            data,
        });
        if (!count) throw new ConflictException('This claim was settled or waived just now');
    }
}
