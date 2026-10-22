import { clinicChangeRefusal, clinicPage, itemUpdateRefusal, selfPayRefusal } from './items.rules';

const COST = { packCost: 1234.5, unitsPerPack: 100 };
const WITH_COST = ['billable.cost.create'];

describe('selfPayRefusal', () => {
    describe('MANUAL', () => {
        it('accepts an amount', () => {
            expect(selfPayRefusal({ basis: 'MANUAL', amount: 4500 }, [])).toBeNull();
        });

        it('accepts a zero amount (a free service still has a price line)', () => {
            expect(selfPayRefusal({ basis: 'MANUAL', amount: 0 }, [])).toBeNull();
        });

        it('needs an amount', () => {
            expect(selfPayRefusal({ basis: 'MANUAL' }, [])?.reason).toMatch(/needs an amount/);
        });

        it('refuses a percent or cost', () => {
            expect(selfPayRefusal({ basis: 'MANUAL', amount: 4500, percent: 10 }, [])?.reason).toMatch(/only an amount/);
            expect(selfPayRefusal({ basis: 'MANUAL', amount: 4500, cost: COST }, [])?.reason).toMatch(/only an amount/);
        });

        it("doesn't need the cost permission", () => {
            expect(selfPayRefusal({ basis: 'MANUAL', amount: 4500 }, [])).toBeNull();
        });
    });

    describe('MARKUP', () => {
        it('accepts a percent and cost', () => {
            expect(selfPayRefusal({ basis: 'MARKUP', percent: 30, cost: COST }, WITH_COST)).toBeNull();
        });

        it('needs both a percent and a cost', () => {
            expect(selfPayRefusal({ basis: 'MARKUP', percent: 30 }, WITH_COST)?.reason).toMatch(/needs a percent and the cost/);
            expect(selfPayRefusal({ basis: 'MARKUP', cost: COST }, WITH_COST)?.reason).toMatch(/needs a percent and the cost/);
        });

        it('refuses an amount', () => {
            expect(selfPayRefusal({ basis: 'MARKUP', percent: 30, cost: COST, amount: 16 }, WITH_COST)?.reason).toMatch(/takes no amount/);
        });

        it('is forbidden without billable.cost.create, since it records the first cost', () => {
            expect(selfPayRefusal({ basis: 'MARKUP', percent: 30, cost: COST }, ['billable.item.create', 'billable.price.create']))
                .toEqual({ reason: 'Missing permission: billable.cost.create', forbidden: true });
        });
    });
});

describe('itemUpdateRefusal', () => {
    it('reports a missing item', () => {
        expect(itemUpdateRefusal(null, null).reason).toBe('Billable item not found');
        expect(itemUpdateRefusal(null, 'LABORATORY').reason).toBe('Billable item not found');
    });

    it('refuses a move to a category of a different kind', () => {
        expect(itemUpdateRefusal({ kind: 'LABORATORY' }, 'PHARMACY').reason)
            .toMatch(/same kind \(LABORATORY, not PHARMACY\)/);
    });

    it('treats a same-kind miss as not found, since that move would have succeeded', () => {
        expect(itemUpdateRefusal({ kind: 'LABORATORY' }, 'LABORATORY').reason).toBe('Billable item not found');
    });
});

describe('clinicChangeRefusal', () => {
    it('allows adds and removes of different clinics', () => {
        expect(clinicChangeRefusal(['eye'], ['gopd'])).toBeNull();
    });

    it('allows either list on its own, or neither', () => {
        expect(clinicChangeRefusal(['eye'], undefined)).toBeNull();
        expect(clinicChangeRefusal(undefined, ['gopd'])).toBeNull();
        expect(clinicChangeRefusal()).toBeNull();
    });

    it('refuses a clinic in both lists, naming it', () => {
        expect(clinicChangeRefusal(['eye', 'ent'], ['ent'])?.reason).toBe("A clinic can't be both added and removed: ent");
    });
});

describe('clinicPage', () => {
    it("fills the first page with the clinic's items, then the rest", () => {
        // 3 linked, page of 20 → the 3 linked, then the first 17 others
        expect(clinicPage(3, 0, 20)).toEqual({ linked: { skip: 0, take: 3 }, others: { skip: 0, take: 17 } });
    });

    it('carries on into the others where the linked items end', () => {
        // 3 linked, second page of 2 (items 3–4): the third linked item, then the first other
        expect(clinicPage(3, 2, 2)).toEqual({ linked: { skip: 2, take: 1 }, others: { skip: 0, take: 1 } });
    });

    it('takes only others once past the linked items', () => {
        // 3 linked, offset 20 → others from 17
        expect(clinicPage(3, 20, 20)).toEqual({ linked: { skip: 20, take: 0 }, others: { skip: 17, take: 20 } });
    });

    it('is the plain list when nothing is linked', () => {
        expect(clinicPage(0, 40, 20)).toEqual({ linked: { skip: 40, take: 0 }, others: { skip: 40, take: 20 } });
    });
});
