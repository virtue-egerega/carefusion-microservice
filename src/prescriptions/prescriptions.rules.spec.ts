import { prescribableMedicines } from './prescriptions.rules';

const ORG = 'org-1';
const visible = { OR: [{ organizationId: null }, { organizationId: ORG }] };

describe('prescribableMedicines (PRD 16 §3)', () => {
    it('offers every active medicine the organisation sees, seeded or its own, and nothing about stock', () => {
        expect(prescribableMedicines(ORG, {})).toEqual({ AND: [visible, { status: 'ACTIVE' }] });
    });

    it('matches a search against the name, alias or ingredient text, or a therapeutic use name', () => {
        const where = prescribableMedicines(ORG, { search: '  Malaria ' });
        expect(where.AND[2]).toEqual({
            OR: [
                { searchText: { contains: 'malaria' } },
                { therapeuticUses: { some: { use: { name: { contains: 'Malaria', mode: 'insensitive' } } } } },
            ],
        });
    });

    it('ignores a blank search', () => {
        expect(prescribableMedicines(ORG, { search: '   ' }).AND).toHaveLength(2);
    });

    it('applies each filter given', () => {
        expect(prescribableMedicines(ORG, {
            therapeuticUse: 'PAIN', dosageForm: 'TABLET', route: 'ORAL', bodySystem: 'CARDIOVASCULAR', legalCategory: 'POM', controlled: true,
        }).AND[1]).toEqual({
            status:          'ACTIVE',
            dosageForm:      'TABLET',
            route:           'ORAL',
            bodySystems:     { has: 'CARDIOVASCULAR' },
            legalCategory:   'POM',
            controlled:      true,
            therapeuticUses: { some: { use: { code: 'PAIN' } } },
        });
    });

    it('filters on controlled: false, not only true', () => {
        expect(prescribableMedicines(ORG, { controlled: false }).AND[1]).toEqual({ status: 'ACTIVE', controlled: false });
    });
});
