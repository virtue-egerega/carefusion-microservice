import { pharmacyUnitUpdateRefusal, mainPharmacyStore } from './pharmacy-units.rules';

describe('mainPharmacyStore', () => {
    it('is a store in the branch\'s organisation, coded after the branch', () => {
        expect(mainPharmacyStore({ organizationId: 'org-1', code: 'MAIN' })).toEqual({
            organizationId: 'org-1',
            code:           'STORE-MAIN',
            name:           'Main Pharmacy Store',
            type:           'STORE',
        });
    });

    it('gives each branch its own code', () => {
        expect(mainPharmacyStore({ organizationId: 'org-1', code: 'IKJ' }).code).toBe('STORE-IKJ');
    });
});

describe('pharmacyUnitUpdateRefusal', () => {
    it('reports a missing pharmacyUnit', () => {
        expect(pharmacyUnitUpdateRefusal(null, false)).toBe('Pharmacy unit not found');
        expect(pharmacyUnitUpdateRefusal(null, true)).toBe('Pharmacy unit not found');
    });

    it('refuses to deactivate a pharmacyUnit that still holds stock', () => {
        expect(pharmacyUnitUpdateRefusal({ stockHeld: 40 }, true)).toMatch(/still holds 40 selling unit\(s\) of stock/);
    });

    it('treats an empty pharmacyUnit as not found, since deactivating it would have succeeded', () => {
        expect(pharmacyUnitUpdateRefusal({ stockHeld: 0 }, true)).toBe('Pharmacy unit not found');
    });
});
