// Pure rules for PRD 15 §10.5 (no DB access) — unit-tested in supplier-credit-claims.rules.spec.ts.

/** "SCC-000042": the claim number from its counter (SequenceCounter "scc:<orgId>"), quoted to the supplier. */
export const supplierCreditClaimNumber = (n: number) => `SCC-${String(n).padStart(6, '0')}`;

export type ClaimSettlement = {
    settledAs:                  string;          // CREDIT_NOTE | REFUND | REPLACEMENT
    replacementGoodsReceiptId?: string;
};

/** Why a claim can't be settled or waived, or null (§10.5): only an outstanding claim changes, once. */
export function claimChangeRefusal(status: string): string | null {
    return status === 'OUTSTANDING' ? null : `This claim is already ${status.toLowerCase()}`;
}

/**
 * Why a settlement as given is refused, or null (§10.5): replacement goods name the receipt they came back on,
 * and only replacement goods do.
 */
export function claimSettlementRefusal(settlement: ClaimSettlement): string | null {
    if (settlement.settledAs === 'REPLACEMENT' && !settlement.replacementGoodsReceiptId) {
        return 'Name the goods receipt the replacement goods came in on (replacementGoodsReceiptId)';
    }
    if (settlement.settledAs !== 'REPLACEMENT' && settlement.replacementGoodsReceiptId) {
        return 'Only a REPLACEMENT settlement names a goods receipt';
    }
    return null;
}

/**
 * Why a receipt can't be the one that brought the replacement goods, or null (§10.5): a posted delivery from the
 * same supplier, and not the receipt the goods were rejected on.
 */
export function replacementReceiptRefusal(
    claim: { supplierId: string; goodsReceiptId: string },
    receipt: { id: string; type: string; status: string; supplierId: string | null } | null,
): string | null {
    if (!receipt) return 'Replacement goods receipt not found';
    if (receipt.id === claim.goodsReceiptId) return 'The replacement must come on a later receipt, not the one the goods were rejected on';
    if (receipt.type !== 'DELIVERY' || receipt.status !== 'POSTED') return 'The replacement goods receipt must be a posted delivery';
    if (receipt.supplierId !== claim.supplierId) return 'The replacement goods receipt is from another supplier';
    return null;
}
