import { encounterListWhere } from './encounter-list.rules';

describe('encounterListWhere', () => {
    it('filters nothing without filters', () => {
        expect(encounterListWhere({})).toEqual({});
        expect(encounterListWhere({ search: '   ', status: [], visitType: [] })).toEqual({});
    });

    it('applies each filter given', () => {
        const from = new Date('2026-10-01T00:00:00Z');
        const to = new Date('2026-10-22T23:59:59Z');
        expect(encounterListWhere({
            status: ['OPEN', 'CLOSED'], encounterType: 'OUTPATIENT', visitType: ['WALK_IN'], clinicId: 'clinic-1', from, to,
        })).toEqual({
            status: { in: ['OPEN', 'CLOSED'] }, encounterType: 'OUTPATIENT', visitType: { in: ['WALK_IN'] },
            clinicId: 'clinic-1', arrivedAt: { gte: from, lte: to },
        });
    });

    it('takes an open-ended date range', () => {
        const from = new Date('2026-10-01T00:00:00Z');
        expect(encounterListWhere({ from })).toEqual({ arrivedAt: { gte: from } });
    });

    it('finds an encounter by its code, matched on the number', () => {
        expect(encounterListWhere({ search: 'enc-26-481' })).toEqual({ encounterNumber: 481 });
    });

    it('otherwise needs every word in the reason for visit', () => {
        expect(encounterListWhere({ search: ' fever  feeding ' })).toEqual({
            AND: [
                { reasonForVisit: { contains: 'fever', mode: 'insensitive' } },
                { reasonForVisit: { contains: 'feeding', mode: 'insensitive' } },
            ],
        });
    });
});
