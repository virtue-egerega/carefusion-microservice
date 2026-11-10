import { clinicChangeRefusal, clinicPage, itemUpdateRefusal, priceLineRefusal, priceLineState, selfPayRefusal } from './items.rules';

const COST = { purchaseUnitCost: 1234.5, sellingUnitsPerPurchaseUnit: 100 };
const WITH_COST = ['billable.cost.create'];

describe('selfPayRefusal', () => {
    describe('MANUAL', () => {
        it('accepts a selling unit price', () => {
            expect(selfPayRefusal({ basis: 'MANUAL', sellingUnitPrice: 4500 }, [])).toBeNull();
        });

        it('accepts a zero selling unit price (a free service still has a price line)', () => {
            expect(selfPayRefusal({ basis: 'MANUAL', sellingUnitPrice: 0 }, [])).toBeNull();
        });

        it('needs a selling unit price', () => {
            expect(selfPayRefusal({ basis: 'MANUAL' }, [])?.reason).toMatch(/needs a selling unit price/);
        });

        it('refuses a percent or cost', () => {
            expect(selfPayRefusal({ basis: 'MANUAL', sellingUnitPrice: 4500, percent: 10 }, [])?.reason).toMatch(/only a selling unit price/);
            expect(selfPayRefusal({ basis: 'MANUAL', sellingUnitPrice: 4500, cost: COST }, [])?.reason).toMatch(/only a selling unit price/);
        });

        it("doesn't need the cost permission", () => {
            expect(selfPayRefusal({ basis: 'MANUAL', sellingUnitPrice: 4500 }, [])).toBeNull();
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

        it('refuses a selling unit price', () => {
            expect(selfPayRefusal({ basis: 'MARKUP', percent: 30, cost: COST, sellingUnitPrice: 16 }, WITH_COST)?.reason).toMatch(/takes no selling unit price/);
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

    it("refuses a new selling unit once the item has held stock (PRD 15 §3.4)", () => {
        expect(itemUpdateRefusal({ kind: 'PHARMACY', sellingUnitId: 'tablet-id', sellingUnitName: 'Tablet', hasStock: true }, null, 'card-id').reason)
            .toBe("This item has stock counted in Tablet, so its selling unit can't change. Create a new item instead");
    });

    it('treats a unit miss on an item without stock as not found, since that change would have succeeded', () => {
        expect(itemUpdateRefusal({ kind: 'PHARMACY', sellingUnitId: 'tablet-id', hasStock: false }, null, 'card-id').reason).toBe('Billable item not found');
    });

    it('treats an unchanged unit as not found', () => {
        expect(itemUpdateRefusal({ kind: 'PHARMACY', sellingUnitId: 'tablet-id', hasStock: true }, null, 'tablet-id').reason).toBe('Billable item not found');
    });

    it('reports the kind mismatch before the unit', () => {
        expect(itemUpdateRefusal({ kind: 'LABORATORY', sellingUnitId: 'test-id', hasStock: true }, 'PHARMACY', 'tablet-id').reason)
            .toMatch(/same kind/);
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

describe('priceLineRefusal', () => {
    it('accepts a self-pay MANUAL price', () => {
        expect(priceLineRefusal({ basis: 'MANUAL', sellingUnitPrice: 2500 })).toBeNull();
    });

    it('keeps the self-pay line to MANUAL or MARKUP, with no agreement', () => {
        expect(priceLineRefusal({ basis: 'DISCOUNT', percent: 10 })).toMatch(/self-pay line is MANUAL or MARKUP/);
        expect(priceLineRefusal({ basis: 'MANUAL', sellingUnitPrice: 2500, agreementId: 'agr-1' })).toMatch(/Only a payer line/);
    });

    it('needs a TARIFF to carry its price and agreement', () => {
        expect(priceLineRefusal({ basis: 'TARIFF', payerId: 'hyg', sellingUnitPrice: 15000, agreementId: 'agr-1' })).toBeNull();
        expect(priceLineRefusal({ basis: 'TARIFF', payerId: 'hyg', sellingUnitPrice: 15000 })).toMatch(/agreement/);
    });

    it('needs a DISCOUNT percent strictly between 0 and 100', () => {
        expect(priceLineRefusal({ basis: 'DISCOUNT', payerId: 'axa', percent: 15 })).toBeNull();
        expect(priceLineRefusal({ basis: 'DISCOUNT', payerId: 'axa', percent: 100 })).toMatch(/between 0 and 100/);
    });

    it('refuses a price on a MARKUP line', () => {
        expect(priceLineRefusal({ basis: 'MARKUP', percent: 30, sellingUnitPrice: 16 })).toMatch(/takes no selling unit price/);
    });
});

describe('priceLineState', () => {
    const at = new Date('2026-11-04T12:00:00Z');
    const line = (effectiveFrom: string, effectiveTo: string | null = null, cancelledAt: string | null = null) => ({
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo:   effectiveTo ? new Date(effectiveTo) : null,
        cancelledAt:   cancelledAt ? new Date(cancelledAt) : null,
    });

    it('is CURRENT when it has started and has no end', () => {
        expect(priceLineState(line('2026-10-01T00:00:00Z'), at)).toBe('CURRENT');
    });

    it('is CURRENT when it ends later', () => {
        expect(priceLineState(line('2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z'), at)).toBe('CURRENT');
    });

    it('is CURRENT from the moment it starts (effectiveFrom is inclusive)', () => {
        expect(priceLineState(line('2026-11-04T12:00:00Z'), at)).toBe('CURRENT');
    });

    it('is ENDED from the moment it ends (effectiveTo is exclusive)', () => {
        expect(priceLineState(line('2026-10-01T00:00:00Z', '2026-11-04T12:00:00Z'), at)).toBe('ENDED');
    });

    it('is SCHEDULED when it starts later', () => {
        expect(priceLineState(line('2026-12-01T00:00:00Z'), at)).toBe('SCHEDULED');
    });

    it('is CANCELLED once withdrawn, whatever its dates', () => {
        expect(priceLineState(line('2026-12-01T00:00:00Z', null, '2026-11-01T00:00:00Z'), at)).toBe('CANCELLED');
    });
});
