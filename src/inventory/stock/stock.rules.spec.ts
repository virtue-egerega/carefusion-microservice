import { Prisma } from '../../../generated/prisma/client';
import {
    batchCostPrice, expiryGroup, fefoOrder, isExpired, qualityChangeRefusal, quantityRefusal, returnRefusal, statusChangeRefusal,
    stockValue, unusableReason,
} from './stock.rules';

const date = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = date('2026-11-02');

describe('isExpired', () => {
    it('is expired from the day after the expiry date', () => {
        expect(isExpired(date('2026-11-02'), TODAY)).toBe(false);
        expect(isExpired(date('2026-11-01'), TODAY)).toBe(true);
    });

    it('never expires without an expiry date', () => {
        expect(isExpired(null, TODAY)).toBe(false);
    });
});

describe('unusableReason', () => {
    const USABLE = { status: 'AVAILABLE', qualityStatus: 'RELEASED', expiryDate: date('2027-06-30'), unitActive: true, itemActive: true };

    it('accepts available, released, unexpired stock in an active unit', () => {
        expect(unusableReason(USABLE, TODAY)).toBeNull();
    });

    it('says why stock is unusable', () => {
        expect(unusableReason({ ...USABLE, status: 'QUARANTINE' }, TODAY)).toBe('it is in quarantine');
        expect(unusableReason({ ...USABLE, qualityStatus: 'RECALLED' }, TODAY)).toBe('the batch is recalled');
        expect(unusableReason({ ...USABLE, qualityStatus: 'ON_HOLD' }, TODAY)).toBe('the batch is on hold');
        expect(unusableReason({ ...USABLE, expiryDate: date('2026-10-31') }, TODAY)).toBe('the batch is expired');
        expect(unusableReason({ ...USABLE, unitActive: false }, TODAY)).toBe('the pharmacy unit is inactive');
        expect(unusableReason({ ...USABLE, itemActive: false }, TODAY)).toBe('the product is inactive');
    });
});

describe('fefoOrder', () => {
    it('offers the soonest expiry first, no expiry last, then first received', () => {
        const offered = fefoOrder([
            { batchId: 'a123', expiryDate: date('2027-06-30'), firstReceivedAt: date('2026-11-02') },
            { batchId: 'none', expiryDate: null, firstReceivedAt: date('2026-01-01') },
            { batchId: 'b456', expiryDate: date('2027-03-31'), firstReceivedAt: date('2026-11-05') },
            { batchId: 'c789', expiryDate: date('2027-03-31'), firstReceivedAt: date('2026-11-04') },
        ]);
        expect(offered.map(b => b.batchId)).toEqual(['c789', 'b456', 'a123', 'none']);
    });
});

describe('quantityRefusal', () => {
    it('accepts whole selling units', () => {
        expect(quantityRefusal(3, false)).toBeNull();
    });

    it('accepts a half only where the product allows it', () => {
        expect(quantityRefusal(1.5, true)).toBeNull();
        expect(quantityRefusal(0.5, false)).toMatch(/whole selling units only/);
    });

    it('never accepts another fraction, zero or less', () => {
        expect(quantityRefusal(0.8, true)).toMatch(/whole selling units, or a half/);
        expect(quantityRefusal(0, true)).toMatch(/more than zero/);
        expect(quantityRefusal(-1, true)).toMatch(/more than zero/);
    });
});

describe('statusChangeRefusal', () => {
    const ALL = ['pharmacy.stock.status', 'pharmacy.stock.release'];

    it('releases quarantine with pharmacy.stock.release only', () => {
        expect(statusChangeRefusal('QUARANTINE', 'AVAILABLE', ALL)).toBeNull();
        expect(statusChangeRefusal('QUARANTINE', 'AVAILABLE', ['pharmacy.stock.status'])).toEqual({
            reason: 'Missing permission: pharmacy.stock.release', forbidden: true,
        });
    });

    it('quarantines or sets aside stock with pharmacy.stock.status', () => {
        expect(statusChangeRefusal('AVAILABLE', 'QUARANTINE', ['pharmacy.stock.status'])).toBeNull();
        expect(statusChangeRefusal('AVAILABLE', 'DAMAGED', ['pharmacy.stock.status'])).toBeNull();
    });

    it('never brings damaged stock back, or changes to the same status', () => {
        expect(statusChangeRefusal('DAMAGED', 'AVAILABLE', ALL)?.reason).toBe("Stock can't move from DAMAGED to AVAILABLE");
        expect(statusChangeRefusal('AVAILABLE', 'AVAILABLE', ALL)?.reason).toMatch(/already available/);
    });
});

describe('qualityChangeRefusal', () => {
    it('holds and releases a batch', () => {
        expect(qualityChangeRefusal('RELEASED', 'ON_HOLD')).toBeNull();
        expect(qualityChangeRefusal('ON_HOLD', 'RELEASED')).toBeNull();
    });

    it('needs a reference to recall, and never undoes a recall', () => {
        expect(qualityChangeRefusal('RELEASED', 'RECALLED')).toMatch(/needs its reference/);
        expect(qualityChangeRefusal('ON_HOLD', 'RECALLED', 'NAFDAC/RC/2026/14')).toBeNull();
        expect(qualityChangeRefusal('RECALLED', 'RELEASED')).toMatch(/stays recalled/);
    });
});

describe('returnRefusal', () => {
    const ISSUED = new Map([['b456', 3]]);

    it('takes back up to what was issued, less what came back already', () => {
        expect(returnRefusal([{ batchId: 'b456', sellingUnitQuantity: 2 }], ISSUED, new Map([['b456', 1]]))).toBeNull();
        expect(returnRefusal([{ batchId: 'b456', sellingUnitQuantity: 3 }], ISSUED, new Map([['b456', 1]]))).toMatch(/Only 2 selling unit/);
    });

    it('refuses a batch that was never issued here', () => {
        expect(returnRefusal([{ batchId: 'a123', sellingUnitQuantity: 1 }], ISSUED, new Map())).toMatch(/Nothing of batch a123/);
    });

    it('refuses a zero or negative return', () => {
        expect(returnRefusal([{ batchId: 'b456', sellingUnitQuantity: 0 }], ISSUED, new Map())).toMatch(/more than zero/);
    });

    it('adds up lines for the same batch', () => {
        expect(returnRefusal([{ batchId: 'b456', sellingUnitQuantity: 2 }, { batchId: 'b456', sellingUnitQuantity: 2 }], ISSUED, new Map())).toMatch(/Only 3/);
    });
});

describe('batchCostPrice and stockValue', () => {
    const d = (v: number) => new Prisma.Decimal(v);

    it('averages a lot that came in several deliveries, by selling units', () => {
        // 10 cartons at 24,000 and 10 at 26,000, 24 bottles each: 500,000 / 240 = 2,083.33… a bottle
        const cost = batchCostPrice([
            { purchaseUnitCost: d(24000), purchaseUnitsAccepted: 10, sellingUnitsPerPurchaseUnit: 24 },
            { purchaseUnitCost: d(26000), purchaseUnitsAccepted: 10, sellingUnitsPerPurchaseUnit: 24 },
        ]);
        expect(cost?.toFixed(4)).toBe('2083.3333');
    });

    it('values a quantity at the exact cost, rounded once', () => {
        // 120 × 2,083.33… is exactly 250,000.00, not 120 × a rounded 2,083.34 = 250,000.80
        const cost = batchCostPrice([{ purchaseUnitCost: d(50000), purchaseUnitsAccepted: 5, sellingUnitsPerPurchaseUnit: 24 }]);
        expect(stockValue(120, cost)?.toFixed(2)).toBe('250000.00');
    });

    it('rounds a value up, never down', () => {
        // 1 bottle at 2,083.33… is 2,083.34
        const cost = batchCostPrice([{ purchaseUnitCost: d(50000), purchaseUnitsAccepted: 5, sellingUnitsPerPurchaseUnit: 24 }]);
        expect(stockValue(1, cost)?.toFixed(2)).toBe('2083.34');
    });

    it('has no cost when nothing was accepted', () => {
        expect(batchCostPrice([{ purchaseUnitCost: d(50000), purchaseUnitsAccepted: 0, sellingUnitsPerPurchaseUnit: 24 }])).toBeNull();
        expect(stockValue(10, null)).toBeNull();
    });
});

describe('expiryGroup', () => {
    it('groups expired, expiring within the window, and the rest', () => {
        expect(expiryGroup(date('2026-10-31'), TODAY, 90)).toBe('EXPIRED');
        expect(expiryGroup(date('2027-01-15'), TODAY, 90)).toBe('EXPIRING');
        expect(expiryGroup(date('2027-06-30'), TODAY, 90)).toBeNull();
        expect(expiryGroup(null, TODAY, 90)).toBeNull();
    });
});
