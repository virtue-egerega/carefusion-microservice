import { productRefusal, stockItemRefusal, unitsChangeRefusal } from './stock-items.rules';

const ACTIVE = { status: 'ACTIVE' };
const INACTIVE = { status: 'INACTIVE' };

describe('stockItemRefusal', () => {
    describe('medicine link', () => {
        it('accepts a PHARMACY item with its medicine', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', medicineId: 'medicine-1', medicine: ACTIVE })).toBeNull();
        });

        it('requires a PHARMACY item to name its medicine', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', medicineId: null })?.reason).toBe('A PHARMACY item must name its medicine');
        });

        it('keeps the medicine already linked when the change leaves it out', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', medicineId: 'medicine-1' })).toBeNull();
        });

        it('refuses a medicine on any other kind', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', medicineId: 'medicine-1', medicine: ACTIVE })?.reason)
                .toMatch(/Only PHARMACY items name a medicine; this item is CONSUMABLE/);
        });

        it('accepts a consumable without a medicine', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', medicineId: null })).toBeNull();
        });

        it('reports a medicine that is missing or not visible as not found', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', medicineId: 'medicine-x', medicine: null })).toEqual({ reason: 'Medicine not found', notFound: true });
        });

        it('refuses an inactive medicine', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', medicineId: 'medicine-1', medicine: INACTIVE })?.reason).toBe('That medicine is inactive');
        });
    });

    describe('manufacturer', () => {
        it('accepts an active manufacturer', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', medicineId: null, manufacturer: ACTIVE })).toBeNull();
        });

        it('reports a missing manufacturer as not found', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', medicineId: null, manufacturer: null }))
                .toEqual({ reason: 'Manufacturer not found', notFound: true });
        });

        it('refuses an inactive manufacturer', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', medicineId: null, manufacturer: INACTIVE })?.reason)
                .toBe('That manufacturer is inactive');
        });
    });

    it('checks the medicine rule before the manufacturer', () => {
        expect(stockItemRefusal({ kind: 'PHARMACY', medicineId: null, manufacturer: null })?.reason)
            .toBe('A PHARMACY item must name its medicine');
    });
});

describe('productRefusal', () => {
    const PRODUCT = { categoryId: 'cat-1' };

    it('accepts a category picked by id or by name', () => {
        expect(productRefusal(PRODUCT, [])).toBeNull();
        expect(productRefusal({ category: { name: 'Antibiotics' } }, [])).toBeNull();
    });

    it('needs exactly one way of giving the category', () => {
        expect(productRefusal({}, [])?.reason).toMatch(/Give the category/);
        expect(productRefusal({ categoryId: 'cat-1', category: { name: 'Antibiotics' } }, [])?.reason).toMatch(/Give the category/);
    });

    it('refuses both a manufacturer id and a name', () => {
        expect(productRefusal({ ...PRODUCT, manufacturerId: 'm-1', manufacturer: { name: 'GSK' } }, [])?.reason).toMatch(/not both/);
    });

    it('pairs a first price with its reason', () => {
        expect(productRefusal({ ...PRODUCT, sellingUnitPrice: 2500 }, ['billable.price.create'])?.reason).toMatch(/needs a reason/);
        expect(productRefusal({ ...PRODUCT, reason: 'Launch price' }, [])?.reason).toMatch(/needs a reason/);
    });

    it('needs billable.price.create to set a price', () => {
        expect(productRefusal({ ...PRODUCT, sellingUnitPrice: 2500, reason: 'Launch price' }, [])).toEqual({
            reason: 'Missing permission: billable.price.create', forbidden: true,
        });
        expect(productRefusal({ ...PRODUCT, sellingUnitPrice: 2500, reason: 'Launch price' }, ['billable.price.create'])).toBeNull();
    });
});

describe('unitsChangeRefusal', () => {
    const UNITS = { purchaseUnitName: 'Carton', sellingUnitsPerPurchaseUnit: 24, sellableInHalves: false };

    it('needs the purchase unit and its size when an item is first stocked', () => {
        expect(unitsChangeRefusal(null, {})?.reason).toMatch(/needs its purchaseUnitName and sellingUnitsPerPurchaseUnit/);
        expect(unitsChangeRefusal(null, { purchaseUnitName: 'Carton', sellingUnitsPerPurchaseUnit: 24 })).toBeNull();
    });

    it('lets a product without stock change its units', () => {
        expect(unitsChangeRefusal({ ...UNITS, hasStock: false }, { sellingUnitsPerPurchaseUnit: 12 })).toBeNull();
    });

    it('fixes the units once the product has stock, naming what was changed', () => {
        expect(unitsChangeRefusal({ ...UNITS, hasStock: true }, { sellingUnitsPerPurchaseUnit: 12, sellableInHalves: true })?.reason)
            .toBe("This product has stock, so sellingUnitsPerPurchaseUnit, sellableInHalves can't change. Add a new product instead");
    });

    it('accepts the same values again on a product with stock', () => {
        expect(unitsChangeRefusal({ ...UNITS, hasStock: true }, { purchaseUnitName: 'Carton', sellingUnitsPerPurchaseUnit: 24 })).toBeNull();
    });
});
