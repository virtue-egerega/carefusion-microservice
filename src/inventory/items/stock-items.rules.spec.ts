import { packDefaultAfter, stockItemRefusal } from './stock-items.rules';

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

describe('packDefaultAfter', () => {
    const activeDefault = { status: 'ACTIVE', isDefault: true };
    const activePlain = { status: 'ACTIVE', isDefault: false };
    const inactive = { status: 'INACTIVE', isDefault: false };

    it('makes an active pack the default', () => {
        expect(packDefaultAfter(activePlain, { isDefault: true })).toEqual({ isDefault: true });
    });

    it('keeps the flag when the change leaves it out', () => {
        expect(packDefaultAfter(activeDefault, { status: 'ACTIVE' })).toEqual({ isDefault: true });
        expect(packDefaultAfter(activePlain, {})).toEqual({ isDefault: false });
    });

    it('clears the flag when the default pack is deactivated', () => {
        expect(packDefaultAfter(activeDefault, { status: 'INACTIVE' })).toEqual({ isDefault: false });
    });

    it('refuses to make an inactive pack the default', () => {
        expect(packDefaultAfter(inactive, { isDefault: true })).toEqual({ reason: "An inactive pack can't be the default" });
        expect(packDefaultAfter(activePlain, { status: 'INACTIVE', isDefault: true })).toEqual({ reason: "An inactive pack can't be the default" });
    });

    it('can reactivate a pack and make it the default together', () => {
        expect(packDefaultAfter(inactive, { status: 'ACTIVE', isDefault: true })).toEqual({ isDefault: true });
    });
});
