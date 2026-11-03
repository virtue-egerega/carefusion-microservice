import { claimChangeRefusal, claimSettlementRefusal, replacementReceiptRefusal, supplierCreditClaimNumber } from './supplier-credit-claims.rules';

describe('supplierCreditClaimNumber', () => {
    it('pads the counter to six digits', () => {
        expect(supplierCreditClaimNumber(42)).toBe('SCC-000042');
    });
});

describe('claimChangeRefusal', () => {
    it('lets an outstanding claim be settled or waived', () => {
        expect(claimChangeRefusal('OUTSTANDING')).toBeNull();
    });

    it('refuses a claim already settled or waived', () => {
        expect(claimChangeRefusal('SETTLED')).toMatch(/already settled/);
        expect(claimChangeRefusal('WAIVED')).toMatch(/already waived/);
    });
});

describe('claimSettlementRefusal', () => {
    it('needs the receipt the replacement goods came on', () => {
        expect(claimSettlementRefusal({ settledAs: 'REPLACEMENT' })).toMatch(/replacementGoodsReceiptId/);
        expect(claimSettlementRefusal({ settledAs: 'REPLACEMENT', replacementGoodsReceiptId: 'grn-2' })).toBeNull();
    });

    it('takes no receipt for a credit note or refund', () => {
        expect(claimSettlementRefusal({ settledAs: 'CREDIT_NOTE' })).toBeNull();
        expect(claimSettlementRefusal({ settledAs: 'REFUND', replacementGoodsReceiptId: 'grn-2' })).toMatch(/Only a REPLACEMENT/);
    });
});

describe('replacementReceiptRefusal', () => {
    const CLAIM = { supplierId: 'alpha', goodsReceiptId: 'grn-1' };
    const RECEIPT = { id: 'grn-2', type: 'DELIVERY', status: 'POSTED', supplierId: 'alpha' };

    it('accepts a later posted delivery from the same supplier', () => {
        expect(replacementReceiptRefusal(CLAIM, RECEIPT)).toBeNull();
    });

    it('refuses a missing, draft, opening, same or other-supplier receipt', () => {
        expect(replacementReceiptRefusal(CLAIM, null)).toMatch(/not found/);
        expect(replacementReceiptRefusal(CLAIM, { ...RECEIPT, status: 'DRAFT' })).toMatch(/posted delivery/);
        expect(replacementReceiptRefusal(CLAIM, { ...RECEIPT, type: 'OPENING', supplierId: null })).toMatch(/posted delivery/);
        expect(replacementReceiptRefusal(CLAIM, { ...RECEIPT, id: 'grn-1' })).toMatch(/later receipt/);
        expect(replacementReceiptRefusal(CLAIM, { ...RECEIPT, supplierId: 'beta' })).toMatch(/another supplier/);
    });
});
