import { AgeGroup } from '@shared/enums/users/user.enums';
import { AgeSettings, ageGroup, ageInDays, ageSettingsProblem, ageSnapshot } from './age-group';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = d('2026-10-13');
const settings: AgeSettings = {
    neonateMaxDays: 28, infantBelowYears: 1, underFiveBelowYears: 5, childMaxYears: 12,
    paediatricMaxAge: 17, geriatricMinAge: 60,
};
const group = (dob: string, s: Partial<AgeSettings> = {}) => ageGroup(d(dob), today, { ...settings, ...s });

describe('ageGroup', () => {
    it('places newborns within neonateMaxDays as NEONATE', () => {
        expect(group('2026-10-13')).toBe(AgeGroup.NEONATE);
        expect(group('2026-09-15')).toBe(AgeGroup.NEONATE);   // day 28
        expect(group('2026-09-14')).toBe(AgeGroup.INFANT);    // day 29
    });

    it('uses the early-life bands up to 5 years', () => {
        expect(group('2025-10-14')).toBe(AgeGroup.INFANT);      // 11 months
        expect(group('2025-10-13')).toBe(AgeGroup.UNDER_FIVE);  // 1st birthday
        expect(group('2021-10-14')).toBe(AgeGroup.UNDER_FIVE);  // 4 years
        expect(group('2021-10-13')).toBe(AgeGroup.CHILD);       // 5th birthday
    });

    it("splits paediatrics at childMaxYears and ends it at the hospital's cutoff", () => {
        expect(group('2014-10-13')).toBe(AgeGroup.CHILD);       // 12
        expect(group('2013-10-13')).toBe(AgeGroup.ADOLESCENT);  // 13
        expect(group('2009-10-13')).toBe(AgeGroup.ADOLESCENT);  // 17
        expect(group('2008-10-13')).toBe(AgeGroup.ADULT);       // 18
    });

    it('moves the bands when the hospital changes them', () => {
        expect(group('2013-10-13', { childMaxYears: 14 })).toBe(AgeGroup.CHILD);            // 13
        expect(group('2026-09-10', { neonateMaxDays: 35 })).toBe(AgeGroup.NEONATE);         // day 33
        expect(group('2013-10-13', { paediatricMaxAge: 12 })).toBe(AgeGroup.ADULT);         // no adolescent band
        expect(group('1966-10-13', { geriatricMinAge: 65 })).toBe(AgeGroup.ADULT);          // 60
    });

    it("starts older adults at the hospital's geriatric cutoff", () => {
        expect(group('1966-10-14')).toBe(AgeGroup.ADULT);        // 59
        expect(group('1966-10-13')).toBe(AgeGroup.OLDER_ADULT);  // 60
    });

    it('is unknown without a date of birth', () => {
        expect(ageGroup(null, today, settings)).toBeNull();
    });

    it('is unknown from 5 years when the hospital has not set its cutoffs', () => {
        const unset = { paediatricMaxAge: null, geriatricMinAge: null };
        expect(group('2026-10-01', unset)).toBe(AgeGroup.NEONATE);   // early-life bands still work
        expect(group('2000-01-01', unset)).toBeNull();
    });

    it('is unknown for a date of birth in the future', () => {
        expect(group('2026-12-01')).toBeNull();
    });
});

describe('ageSettingsProblem', () => {
    it('accepts the standard settings, and unset cutoffs', () => {
        expect(ageSettingsProblem(settings)).toBeNull();
        expect(ageSettingsProblem({ ...settings, paediatricMaxAge: null, geriatricMinAge: null })).toBeNull();
    });

    it('rejects settings out of order', () => {
        expect(ageSettingsProblem({ ...settings, geriatricMinAge: 15 })).toMatch(/geriatricMinAge/);
        expect(ageSettingsProblem({ ...settings, paediatricMaxAge: 10 })).toMatch(/paediatricMaxAge/);
        expect(ageSettingsProblem({ ...settings, neonateMaxDays: 400 })).toMatch(/neonateMaxDays/);
    });
});

describe('ageSnapshot', () => {
    it('records age in days and the group on the day', () => {
        expect(ageSnapshot(d('2026-09-15'), today, settings)).toEqual({ ageAtArrivalDays: 28, ageGroup: AgeGroup.NEONATE });
    });

    it('records nothing when the date of birth is unknown', () => {
        expect(ageSnapshot(null, today, settings)).toEqual({ ageAtArrivalDays: null, ageGroup: null });
    });

    it('counts days across a leap year', () => {
        expect(ageInDays(d('2024-02-28'), d('2024-03-01'))).toBe(2);
    });
});
