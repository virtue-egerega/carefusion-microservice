import { AgeGroup } from '@shared/enums/users/user.enums';

/**
 * The organisation's age-group settings (06 §2.7), stored on `Organization` and editable by the
 * hospital. The early-life bands have standard defaults; the paediatric and geriatric cutoffs
 * have none, and stay null until the hospital sets them.
 */
export type AgeSettings = {
    neonateMaxDays:      number;          // NEONATE up to this many days, e.g. 28
    infantBelowYears:    number;          // INFANT below this age, e.g. 1
    underFiveBelowYears: number;          // UNDER_FIVE below this age, e.g. 5
    childMaxYears:       number;          // CHILD up to this age, then ADOLESCENT, e.g. 12
    paediatricMaxAge:    number | null;   // last paediatric age, e.g. 12, 15, 17
    geriatricMinAge:     number | null;   // first older-adult age, e.g. 60, 65
};

/** Prisma `select` for the settings, so they can be joined into a patient read (no extra query). */
export const AGE_SETTINGS_SELECT = {
    neonateMaxDays: true, infantBelowYears: true, underFiveBelowYears: true, childMaxYears: true,
    paediatricMaxAge: true, geriatricMinAge: true,
} as const;

/** Why a set of age settings is inconsistent, or null if it's fine. Unset cutoffs are skipped. */
export function ageSettingsProblem(s: AgeSettings): string | null {
    const ordered: [string, number | null][] = [
        ['infantBelowYears',    s.infantBelowYears],
        ['underFiveBelowYears', s.underFiveBelowYears],
        ['childMaxYears',       s.childMaxYears],
        ['paediatricMaxAge',    s.paediatricMaxAge],
        ['geriatricMinAge',     s.geriatricMinAge],
    ];
    if (s.neonateMaxDays >= 365 * s.infantBelowYears) return 'neonateMaxDays must be shorter than the infant band';

    const set = ordered.filter((entry): entry is [string, number] => entry[1] !== null);
    for (let i = 1; i < set.length; i++) {
        const [prevKey, prev] = set[i - 1];
        const [key, value] = set[i];
        // underFive may equal childMaxYears' lower edge; every other step must strictly increase
        const ok = key === 'childMaxYears' ? value >= prev : value > prev;
        if (!ok) return `${key} must be greater than ${prevKey}`;
    }
    return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from date of birth to `at` (UTC). */
export function ageInDays(dateOfBirth: Date, at: Date): number {
    const dob = Date.UTC(dateOfBirth.getUTCFullYear(), dateOfBirth.getUTCMonth(), dateOfBirth.getUTCDate());
    const on  = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    return Math.floor((on - dob) / DAY_MS);
}

/** Completed years of age on `at`. */
export function ageInYears(dateOfBirth: Date, at: Date): number {
    let years = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const birthdayThisYear = new Date(dateOfBirth);
    birthdayThisYear.setUTCFullYear(at.getUTCFullYear());
    if (birthdayThisYear > at) years--;
    return years;
}

/**
 * The patient's age group on `at` (06 §2.7). Null when the date of birth isn't known, or when the
 * hospital hasn't set the cutoff an older patient's group depends on.
 */
export function ageGroup(dateOfBirth: Date | null, at: Date, s: AgeSettings): AgeGroup | null {
    if (!dateOfBirth) return null;

    const days = ageInDays(dateOfBirth, at);
    if (days < 0) return null;                               // date of birth in the future
    if (days <= s.neonateMaxDays) return AgeGroup.NEONATE;

    const years = ageInYears(dateOfBirth, at);
    if (years < s.infantBelowYears) return AgeGroup.INFANT;
    if (years < s.underFiveBelowYears) return AgeGroup.UNDER_FIVE;

    if (s.paediatricMaxAge === null) return null;
    if (years <= s.paediatricMaxAge) return years <= s.childMaxYears ? AgeGroup.CHILD : AgeGroup.ADOLESCENT;

    if (s.geriatricMinAge === null) return null;
    return years < s.geriatricMinAge ? AgeGroup.ADULT : AgeGroup.OLDER_ADULT;
}

/**
 * What an encounter records when it opens (11 §4) and never recalculates, so history keeps the
 * age and group that applied on the day, under the settings in force that day.
 */
export function ageSnapshot(dateOfBirth: Date | null, at: Date, s: AgeSettings) {
    return {
        ageAtArrivalDays: dateOfBirth ? ageInDays(dateOfBirth, at) : null,
        ageGroup:         ageGroup(dateOfBirth, at, s),
    };
}
