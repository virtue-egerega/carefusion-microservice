import { Prisma } from '../../../generated/prisma/client';
import {
    PostingItem, costRolls, goodsReceiptTotals, postingProblems, priceWarning, goodsReceiptItemProductRefusal, goodsReceiptItemRefusal, goodsReceiptNumber, goodsReceiptSupplierRefusal, sellingUnitsAdded,
} from './goods-receipts.rules';

const d = (v: number) => new Prisma.Decimal(v);
const date = (s: string) => new Date(`${s}T00:00:00Z`);

describe('goodsReceiptNumber', () => {
    it('pads the counter to six digits', () => {
        expect(goodsReceiptNumber(123)).toBe('GRN-000123');
    });
});

describe('goodsReceiptSupplierRefusal', () => {
    it('needs a delivery to name its supplier, by id or by name', () => {
        expect(goodsReceiptSupplierRefusal('DELIVERY', { supplierId: 'sup-1' })).toBeNull();
        expect(goodsReceiptSupplierRefusal('DELIVERY', { supplier: { name: 'Alpha Pharma' } })).toBeNull();
        expect(goodsReceiptSupplierRefusal('DELIVERY', {})).toMatch(/needs its supplier/);
        expect(goodsReceiptSupplierRefusal('DELIVERY', { supplierId: 'sup-1', supplier: { name: 'Alpha Pharma' } })).toMatch(/not both/);
    });

    it('gives opening stock no supplier', () => {
        expect(goodsReceiptSupplierRefusal('OPENING', {})).toBeNull();
        expect(goodsReceiptSupplierRefusal('OPENING', { supplierId: 'sup-1' })).toMatch(/no supplier/);
    });
});

describe('goodsReceiptItemProductRefusal', () => {
    it('takes an existing product or a new one', () => {
        expect(goodsReceiptItemProductRefusal({ stockItemId: 'amx-24' })).toBeNull();
        expect(goodsReceiptItemProductRefusal({ newProduct: { name: 'Amoxil 125mg/5ml Suspension, carton of 24' } })).toBeNull();
    });

    it('needs exactly one of the two', () => {
        expect(goodsReceiptItemProductRefusal({})).toMatch(/Give the product/);
        expect(goodsReceiptItemProductRefusal({ stockItemId: 'amx-24', newProduct: {} })).toMatch(/Give the product/);
    });
});

describe('goodsReceiptItemRefusal', () => {
    it('accepts a full delivery', () => {
        expect(goodsReceiptItemRefusal({ purchaseUnitsDelivered: 50, purchaseUnitsAccepted: 50 })).toBeNull();
    });

    it('never accepts more than was delivered', () => {
        expect(goodsReceiptItemRefusal({ purchaseUnitsDelivered: 10, purchaseUnitsAccepted: 11 })).toMatch(/More purchase units accepted than delivered/);
    });

    it('needs a reason for rejected purchase units', () => {
        expect(goodsReceiptItemRefusal({ purchaseUnitsDelivered: 20, purchaseUnitsAccepted: 19 })).toMatch(/rejectReason/);
        expect(goodsReceiptItemRefusal({ purchaseUnitsDelivered: 20, purchaseUnitsAccepted: 19, rejectReason: '1 crushed' })).toBeNull();
    });

    it('needs a reason to leave the cost price alone', () => {
        expect(goodsReceiptItemRefusal({ purchaseUnitsDelivered: 1, purchaseUnitsAccepted: 1, updateCost: false })).toMatch(/keepCostReason/);
        expect(goodsReceiptItemRefusal({ purchaseUnitsDelivered: 1, purchaseUnitsAccepted: 1, updateCost: false, keepCostReason: 'Donated' })).toBeNull();
    });
});

describe('sellingUnitsAdded', () => {
    it('counts accepted purchase units in selling units', () => {
        // 50 cartons of 24 bottles
        expect(sellingUnitsAdded({ purchaseUnitsAccepted: 50, sellingUnitsPerPurchaseUnit: 24 })).toBe(1200);
    });
});

describe('postingProblems', () => {
    const ITEM: PostingItem = {
        product: 'Amoxil 125mg/5ml', batchTracked: true, productActive: true,
        sellingUnitsPerPurchaseUnit: 24, productSellingUnitsPerPurchaseUnit: 24,
        batchNumber: 'A123', expiryDate: date('2027-06-30'), manufacturedOn: null, pharmacyUnitOk: true,
    };
    const RECEIVED = date('2026-11-02');

    it('accepts a valid receipt', () => {
        expect(postingProblems([ITEM], RECEIVED)).toEqual([]);
    });

    it('refuses an empty receipt', () => {
        expect(postingProblems([], RECEIVED)).toEqual(['The receipt has no items']);
    });

    it('lists every problem, naming the item', () => {
        const problems = postingProblems([
            { ...ITEM, batchNumber: null, expiryDate: null },
            { ...ITEM, productActive: false, pharmacyUnitOk: false },
        ], RECEIVED);
        expect(problems).toEqual([
            'Item 1 (Amoxil 125mg/5ml): needs its batch number and expiry',
            'Item 2 (Amoxil 125mg/5ml): the product is inactive',
            'Item 2 (Amoxil 125mg/5ml): the pharmacy unit is inactive or in another branch',
        ]);
    });

    it('lets an item that is not batch-tracked go without batch or expiry', () => {
        expect(postingProblems([{ ...ITEM, batchTracked: false, batchNumber: null, expiryDate: null }], RECEIVED)).toEqual([]);
    });

    it('refuses goods expired on arrival', () => {
        expect(postingProblems([{ ...ITEM, expiryDate: date('2026-11-02') }], RECEIVED)[0]).toMatch(/expired on arrival/);
    });

    it('refuses an item saved before the product changed its units', () => {
        expect(postingProblems([{ ...ITEM, productSellingUnitsPerPurchaseUnit: 12 }], RECEIVED)[0]).toMatch(/holds 12 selling units per purchase unit, not 24/);
    });

    it('gives one lot one expiry, on the receipt and against stock', () => {
        expect(postingProblems([ITEM, { ...ITEM, expiryDate: date('2027-07-31') }], RECEIVED)[0]).toMatch(/two expiry dates/);
        expect(postingProblems([{ ...ITEM, existingBatch: { expiryDate: date('2027-05-31'), manufacturedOn: null } }], RECEIVED)[0])
            .toMatch(/already in stock with expiry 2027-05-31/);
        expect(postingProblems([{ ...ITEM, existingBatch: { expiryDate: date('2027-06-30'), manufacturedOn: null } }], RECEIVED)).toEqual([]);
    });
});

describe('costRolls', () => {
    const CARTON = { itemId: 'amx-24', product: 'Amoxil', updateCost: true, purchaseUnitCost: d(50000), sellingUnitsPerPurchaseUnit: 24 };

    it('starts a cost price for a product with none', () => {
        const { rolls, conflicts } = costRolls([CARTON], new Map());
        expect([...rolls.keys()]).toEqual(['amx-24']);
        expect(conflicts).toEqual([]);
    });

    it('leaves the cost price alone when the cost per selling unit is unchanged', () => {
        // 25,000 for 12 is the same ₦2,083.33… per bottle as 50,000 for 24
        const { rolls } = costRolls([CARTON], new Map([['amx-24', { purchaseUnitCost: d(25000), sellingUnitsPerPurchaseUnit: 12 }]]));
        expect(rolls.size).toBe(0);
    });

    it('rolls when the cost per selling unit changed', () => {
        const { rolls } = costRolls([{ ...CARTON, purchaseUnitCost: d(62400) }], new Map([['amx-24', CARTON]]));
        expect(rolls.get('amx-24')?.purchaseUnitCost.toFixed(2)).toBe('62400.00');
    });

    it('skips items that keep the cost price', () => {
        expect(costRolls([{ ...CARTON, updateCost: false }], new Map()).rolls.size).toBe(0);
    });

    it('refuses two different costs for one product on one receipt', () => {
        const { conflicts } = costRolls([CARTON, { ...CARTON, purchaseUnitCost: d(52000) }], new Map());
        expect(conflicts).toEqual(['Amoxil']);
    });
});

describe('priceWarning', () => {
    const PRODUCT = { itemId: 'amx-24', name: 'Amoxil', sellingUnit: 'bottle' };
    const COST = { purchaseUnitCost: d(62400), sellingUnitsPerPurchaseUnit: 24 };

    it('warns about a product with no selling price yet', () => {
        expect(priceWarning(PRODUCT, COST, undefined)).toMatchObject({ sellingUnitPrice: null });
        expect(priceWarning(PRODUCT, COST, undefined)?.sellingUnitCostPrice.toFixed(2)).toBe('2600.00');
    });

    it('warns when a MANUAL price is now below the cost price', () => {
        expect(priceWarning(PRODUCT, COST, { basis: 'MANUAL', sellingUnitPrice: d(2500) })?.sellingUnitPrice?.toFixed(2)).toBe('2500.00');
    });

    it('says nothing when the price covers the cost, or follows it by MARKUP', () => {
        expect(priceWarning(PRODUCT, COST, { basis: 'MANUAL', sellingUnitPrice: d(3000) })).toBeNull();
        expect(priceWarning(PRODUCT, COST, { basis: 'MARKUP', sellingUnitPrice: null })).toBeNull();
    });
});

describe('goodsReceiptTotals', () => {
    const ITEMS = [
        // 20 cartons delivered, 19 accepted (1 crushed) at 3,500; 50 cartons at 50,000
        { purchaseUnitsDelivered: 20, purchaseUnitsAccepted: 19, purchaseUnitCost: d(3500) },
        { purchaseUnitsDelivered: 50, purchaseUnitsAccepted: 50, purchaseUnitCost: d(50000) },
    ];

    it('adds up what was delivered, accepted and handed back', () => {
        const totals = goodsReceiptTotals(ITEMS, null);
        expect(totals.deliveredValue.toFixed(2)).toBe('2570000.00');
        expect(totals.acceptedValue.toFixed(2)).toBe('2566500.00');
        expect(totals.rejectedValue.toFixed(2)).toBe('3500.00');
        expect(totals.invoiceDifference).toBeNull();
    });

    it('shows how far the lines are from the printed invoice total', () => {
        expect(goodsReceiptTotals(ITEMS, d(2570000)).invoiceDifference?.toFixed(2)).toBe('0.00');
        // a line typed as 5,000 instead of 50,000 shows up
        expect(goodsReceiptTotals([ITEMS[0], { ...ITEMS[1], purchaseUnitCost: d(5000) }], d(2570000)).invoiceDifference?.toFixed(2)).toBe('2250000.00');
    });
});
