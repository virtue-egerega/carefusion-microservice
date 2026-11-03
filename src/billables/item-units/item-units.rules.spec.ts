import { itemUnitRefusal, unitGivenRefusal } from './item-units.rules';

const CARTON = { name: 'Carton', status: 'ACTIVE', kinds: ['PHARMACY', 'CONSUMABLE'], usedForSelling: false, usedForPurchase: true };
const TEST = { name: 'Test', status: 'ACTIVE', kinds: ['LABORATORY'], usedForSelling: true, usedForPurchase: false };

describe('itemUnitRefusal', () => {
    it('accepts a unit offered for that use and kind', () => {
        expect(itemUnitRefusal(CARTON, 'PURCHASE', 'PHARMACY')).toBeNull();
        expect(itemUnitRefusal(TEST, 'SELLING', 'LABORATORY')).toBeNull();
    });

    it('refuses a unit not offered for that use', () => {
        expect(itemUnitRefusal(CARTON, 'SELLING', 'PHARMACY')).toBe("Carton isn't a selling unit");
        expect(itemUnitRefusal(TEST, 'PURCHASE', 'LABORATORY')).toBe("Test isn't a purchase unit");
    });

    it('refuses a unit of another kind', () => {
        expect(itemUnitRefusal(TEST, 'SELLING', 'PHARMACY')).toBe("Test isn't a unit for PHARMACY items");
    });

    it('refuses an inactive unit', () => {
        expect(itemUnitRefusal({ ...CARTON, status: 'INACTIVE' }, 'PURCHASE', 'PHARMACY')).toBe('The unit Carton is inactive');
    });
});

describe('unitGivenRefusal', () => {
    it('takes a unit by id or by name, exactly one', () => {
        expect(unitGivenRefusal('sellingUnit', 'unit-1')).toBeNull();
        expect(unitGivenRefusal('sellingUnit', undefined, { name: 'Strip' })).toBeNull();
        expect(unitGivenRefusal('sellingUnit')).toMatch(/Give the sellingUnit/);
        expect(unitGivenRefusal('sellingUnit', 'unit-1', { name: 'Strip' })).toMatch(/Give the sellingUnit/);
    });
});
