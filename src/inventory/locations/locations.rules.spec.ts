import { locationUpdateRefusal } from './locations.rules';

describe('locationUpdateRefusal', () => {
    it('reports a missing location', () => {
        expect(locationUpdateRefusal(null, false)).toBe('Storage location not found');
        expect(locationUpdateRefusal(null, true)).toBe('Storage location not found');
    });

    it('refuses to deactivate a location that still holds stock', () => {
        expect(locationUpdateRefusal({ stockHeld: 40 }, true)).toMatch(/still holds 40 unit\(s\) of stock/);
    });

    it('treats an empty location as not found, since deactivating it would have succeeded', () => {
        expect(locationUpdateRefusal({ stockHeld: 0 }, true)).toBe('Storage location not found');
    });
});
