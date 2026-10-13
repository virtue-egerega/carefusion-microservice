// Pure rules for PRD 10 §4 (no DB access) — unit-tested in coverage.rules.spec.ts.

export type MemberTypeValue = 'PRINCIPAL' | 'SPOUSE' | 'CHILD' | 'OTHER_DEPENDANT';

export type DependantPlanRules = {
    maxSpouses: number;
    maxChildren: number;
    childMaxAge: number | null;
    allowOtherDependants: boolean;
};

/**
 * The benefit year containing `at`: starts on the policy's validFrom anniversary (PRD 10 §4.3),
 * end exclusive. Policies renew on their own dates, not the calendar year.
 */
export function benefitPeriod(validFrom: Date, at: Date): { start: Date; end: Date } {
    const anniversary = (years: number) => {
        const d = new Date(validFrom);
        d.setUTCFullYear(validFrom.getUTCFullYear() + years);
        return d;
    };

    let years = at.getUTCFullYear() - validFrom.getUTCFullYear();
    if (anniversary(years) > at) years--;
    years = Math.max(years, 0);
    return { start: anniversary(years), end: anniversary(years + 1) };
}

/** Completed years of age on a date. */
export function ageOn(dateOfBirth: Date, at: Date): number {
    let age = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const birthdayThisYear = new Date(dateOfBirth);
    birthdayThisYear.setUTCFullYear(at.getUTCFullYear());
    if (birthdayThisYear > at) age--;
    return age;
}

/**
 * PRD 10 §4.4 enrolment rules for a dependant. Returns the reason it's refused, or null if allowed.
 * `active` counts the policy's current active coverages by member type.
 */
export function dependantRefusal(
    plan: DependantPlanRules,
    memberType: MemberTypeValue,
    active: Partial<Record<MemberTypeValue, number>>,
    dateOfBirth: Date | null,
    at: Date,
): string | null {
    if (memberType === 'PRINCIPAL') return 'A policy has exactly one principal, enrolled with the policy';
    if (!active.PRINCIPAL) return 'The policy has no active principal';

    switch (memberType) {
        case 'SPOUSE':
            if ((active.SPOUSE ?? 0) >= plan.maxSpouses) return `The plan covers at most ${plan.maxSpouses} spouse(s)`;
            return null;
        case 'CHILD':
            if ((active.CHILD ?? 0) >= plan.maxChildren) return `The plan covers at most ${plan.maxChildren} child(ren)`;
            if (plan.childMaxAge !== null) {
                if (!dateOfBirth) return 'Date of birth is required to enrol a child dependant';
                if (ageOn(dateOfBirth, at) >= plan.childMaxAge) {
                    return `Children are covered only under age ${plan.childMaxAge}`;
                }
            }
            return null;
        case 'OTHER_DEPENDANT':
            return plan.allowOtherDependants ? null : 'The plan does not cover other dependants';
    }
}

type Window = { validFrom: Date; validTo: Date | null };
type Status = { status: string };

export type CoverageChain = Window & Status & {
    policy: Window & Status & { plan: Status & { payer: Status } };
};

const inWindow = (w: Window, at: Date) => w.validFrom <= at && (w.validTo === null || at < w.validTo);

/**
 * PRD 10 §6.2 step 1: a coverage applies only when it, its policy, plan and payer are all active
 * and the date falls inside both the coverage's and the policy's validity windows.
 */
export function isCoverageActive(c: CoverageChain, at: Date): boolean {
    return c.status === 'ACTIVE'
        && c.policy.status === 'ACTIVE'
        && c.policy.plan.status === 'ACTIVE'
        && c.policy.plan.payer.status === 'ACTIVE'
        && inWindow(c, at)
        && inWindow(c.policy, at);
}

/** The date a child dependant ages out (their childMaxAge birthday), for Coverage.validTo. */
export function childAgeOutDate(dateOfBirth: Date, childMaxAge: number): Date {
    const d = new Date(dateOfBirth);
    d.setUTCFullYear(dateOfBirth.getUTCFullYear() + childMaxAge);
    return d;
}
