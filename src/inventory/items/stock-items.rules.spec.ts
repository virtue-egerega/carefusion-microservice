import { packDefaultAfter, stockItemRefusal } from './stock-items.rules';

const ACTIVE = { status: 'ACTIVE' };
const INACTIVE = { status: 'INACTIVE' };

describe('stockItemRefusal', () => {
    describe('drug link', () => {
        it('accepts a PHARMACY item with its drug', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', drugId: 'drug-1', drug: ACTIVE })).toBeNull();
        });

        it('requires a PHARMACY item to name its drug', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', drugId: null })?.reason).toBe('A PHARMACY item must name its drug');
        });

        it('keeps the drug already linked when the change leaves it out', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', drugId: 'drug-1' })).toBeNull();
        });

        it('refuses a drug on any other kind', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', drugId: 'drug-1', drug: ACTIVE })?.reason)
                .toMatch(/Only PHARMACY items name a drug; this item is CONSUMABLE/);
        });

        it('accepts a consumable without a drug', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', drugId: null })).toBeNull();
        });

        it('reports a drug that is missing or not visible as not found', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', drugId: 'drug-x', drug: null })).toEqual({ reason: 'Drug not found', notFound: true });
        });

        it('refuses an inactive drug', () => {
            expect(stockItemRefusal({ kind: 'PHARMACY', drugId: 'drug-1', drug: INACTIVE })?.reason).toBe('That drug is inactive');
        });
    });

    describe('manufacturer', () => {
        it('accepts an active manufacturer', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', drugId: null, manufacturer: ACTIVE })).toBeNull();
        });

        it('reports a missing manufacturer as not found', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', drugId: null, manufacturer: null }))
                .toEqual({ reason: 'Manufacturer not found', notFound: true });
        });

        it('refuses an inactive manufacturer', () => {
            expect(stockItemRefusal({ kind: 'CONSUMABLE', drugId: null, manufacturer: INACTIVE })?.reason)
                .toBe('That manufacturer is inactive');
        });
    });

    it('checks the drug rule before the manufacturer', () => {
        expect(stockItemRefusal({ kind: 'PHARMACY', drugId: null, manufacturer: null })?.reason)
            .toBe('A PHARMACY item must name its drug');
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
