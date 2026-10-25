import { medicineSource, medicineUpdateRefusal, sameMedicine, unknownUses, visibleMedicines } from './medicines.rules';

describe('visibleMedicines', () => {
    it("shows seeded medicines and the organisation's own by default", () => {
        expect(visibleMedicines('org-1')).toEqual({ OR: [{ organizationId: null }, { organizationId: 'org-1' }] });
    });

    it('narrows to seeded medicines', () => {
        expect(visibleMedicines('org-1', 'SYSTEM')).toEqual({ organizationId: null });
    });

    it("narrows to the hospital's own, never another organisation's", () => {
        expect(visibleMedicines('org-1', 'USER_ADDED')).toEqual({ organizationId: 'org-1' });
    });
});

describe('medicineSource', () => {
    it('marks a seeded medicine SYSTEM and a hospital one USER_ADDED', () => {
        expect(medicineSource(null)).toBe('SYSTEM');
        expect(medicineSource('org-1')).toBe('USER_ADDED');
    });
});

describe('sameMedicine', () => {
    it('matches the generic name in any case, with the same form and route', () => {
        expect(sameMedicine({ genericName: ' paracetamol ', dosageForm: 'TABLET', route: 'ORAL' })).toEqual({
            genericName: { equals: 'paracetamol', mode: 'insensitive' },
            dosageForm:  'TABLET',
            route:       'ORAL',
        });
    });
});

describe('unknownUses', () => {
    it('lists the codes that were not found, in the order given', () => {
        expect(unknownUses(['PAIN', 'FEVERR', 'FEVER', 'COUGH'], [{ code: 'PAIN' }, { code: 'FEVER' }])).toEqual(['FEVERR', 'COUGH']);
    });

    it('is empty when every code exists, or none were asked for', () => {
        expect(unknownUses(['PAIN'], [{ code: 'PAIN' }])).toEqual([]);
        expect(unknownUses([], [])).toEqual([]);
    });
});

describe('medicineUpdateRefusal', () => {
    it("allows the organisation's own medicine", () => {
        expect(medicineUpdateRefusal({ organizationId: 'org-1' }, 'org-1')).toBeNull();
    });

    it('refuses a seeded medicine as forbidden', () => {
        const refusal = medicineUpdateRefusal({ organizationId: null }, 'org-1');
        expect(refusal?.forbidden).toBe(true);
        expect(refusal?.reason).toMatch(/Seeded medicines can't be changed/);
    });

    it('reports a missing medicine as not found', () => {
        expect(medicineUpdateRefusal(null, 'org-1')).toEqual({ reason: 'Medicine not found' });
    });

    it("treats another organisation's medicine as not found, so it isn't revealed", () => {
        expect(medicineUpdateRefusal({ organizationId: 'org-2' }, 'org-1')).toEqual({ reason: 'Medicine not found' });
    });
});
