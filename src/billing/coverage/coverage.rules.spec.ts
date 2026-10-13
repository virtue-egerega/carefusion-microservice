import { ageOn, benefitPeriod, childAgeOutDate, CoverageChain, dependantRefusal, DependantPlanRules, isCoverageActive } from './coverage.rules';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('benefitPeriod', () => {
    it('runs from the policy anniversary, not the calendar year', () => {
        expect(benefitPeriod(d('2025-04-01'), d('2026-10-13'))).toEqual({ start: d('2026-04-01'), end: d('2027-04-01') });
    });

    it('is still in the previous benefit year the day before the anniversary', () => {
        expect(benefitPeriod(d('2025-04-01'), d('2026-03-31'))).toEqual({ start: d('2025-04-01'), end: d('2026-04-01') });
    });

    it('starts a new benefit year on the anniversary itself', () => {
        expect(benefitPeriod(d('2025-04-01'), d('2026-04-01')).start).toEqual(d('2026-04-01'));
    });

    it('is the first year when the date falls in it', () => {
        expect(benefitPeriod(d('2026-01-15'), d('2026-01-15'))).toEqual({ start: d('2026-01-15'), end: d('2027-01-15') });
    });
});

describe('ageOn', () => {
    it('counts completed years only', () => {
        expect(ageOn(d('2008-10-14'), d('2026-10-13'))).toBe(17);
        expect(ageOn(d('2008-10-13'), d('2026-10-13'))).toBe(18);
    });
});

describe('dependantRefusal', () => {
    const plan: DependantPlanRules = { maxSpouses: 1, maxChildren: 4, childMaxAge: 18, allowOtherDependants: false };
    const today = d('2026-10-13');
    const withPrincipal = { PRINCIPAL: 1 };

    it('allows a spouse and a child within the plan limits', () => {
        expect(dependantRefusal(plan, 'SPOUSE', withPrincipal, null, today)).toBeNull();
        expect(dependantRefusal(plan, 'CHILD', withPrincipal, d('2015-06-01'), today)).toBeNull();
    });

    it('refuses dependants on a policy with no active principal', () => {
        expect(dependantRefusal(plan, 'SPOUSE', {}, null, today)).toMatch(/no active principal/);
    });

    it('refuses a second principal', () => {
        expect(dependantRefusal(plan, 'PRINCIPAL', withPrincipal, null, today)).toMatch(/exactly one principal/);
    });

    it('enforces spouse and child counts', () => {
        expect(dependantRefusal(plan, 'SPOUSE', { PRINCIPAL: 1, SPOUSE: 1 }, null, today)).toMatch(/at most 1 spouse/);
        expect(dependantRefusal(plan, 'CHILD', { PRINCIPAL: 1, CHILD: 4 }, d('2015-06-01'), today)).toMatch(/at most 4 child/);
    });

    it('refuses a child at or over the age limit, or without a date of birth', () => {
        expect(dependantRefusal(plan, 'CHILD', withPrincipal, d('2008-10-13'), today)).toMatch(/under age 18/);
        expect(dependantRefusal(plan, 'CHILD', withPrincipal, null, today)).toMatch(/Date of birth is required/);
    });

    it('needs no date of birth when the plan has no child age limit', () => {
        expect(dependantRefusal({ ...plan, childMaxAge: null }, 'CHILD', withPrincipal, null, today)).toBeNull();
    });

    it('only allows other dependants when the plan does', () => {
        expect(dependantRefusal(plan, 'OTHER_DEPENDANT', withPrincipal, null, today)).toMatch(/does not cover/);
        expect(dependantRefusal({ ...plan, allowOtherDependants: true }, 'OTHER_DEPENDANT', withPrincipal, null, today)).toBeNull();
    });
});

describe('childAgeOutDate', () => {
    it('is the childMaxAge birthday', () => {
        expect(childAgeOutDate(d('2015-06-01'), 18)).toEqual(d('2033-06-01'));
    });
});

describe('isCoverageActive', () => {
    const active = (): CoverageChain => ({
        status: 'ACTIVE', validFrom: d('2026-01-01'), validTo: null,
        policy: {
            status: 'ACTIVE', validFrom: d('2025-04-01'), validTo: d('2027-04-01'),
            plan: { status: 'ACTIVE', payer: { status: 'ACTIVE' } },
        },
    });
    const today = d('2026-10-13');

    it('is active when every level is active and in date', () => {
        expect(isCoverageActive(active(), today)).toBe(true);
    });

    it('is inactive when any level is not active', () => {
        const c1 = active(); c1.status = 'TERMINATED';
        const c2 = active(); c2.policy.status = 'SUSPENDED';
        const c3 = active(); c3.policy.plan.status = 'SUSPENDED';
        const c4 = active(); c4.policy.plan.payer.status = 'SUSPENDED';
        for (const c of [c1, c2, c3, c4]) expect(isCoverageActive(c, today)).toBe(false);
    });

    it('is inactive outside the coverage or policy window (validTo is exclusive)', () => {
        expect(isCoverageActive(active(), d('2025-12-31'))).toBe(false);
        expect(isCoverageActive(active(), d('2027-04-01'))).toBe(false);
    });
});
