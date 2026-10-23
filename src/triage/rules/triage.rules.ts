// Pure triage and vitals rules (PRD 11 §8–9), no DB access. Unit-tested in triage.rules.spec.ts.

/** The measured values of a reading. `takenAt`, `context` and `notes` aren't vitals. */
export const VITAL_FIELDS = [
    'temperature', 'pulse', 'respiratoryRate', 'systolic', 'diastolic', 'spo2',
    'painScore', 'bloodGlucose', 'weight', 'height',
] as const;

export type VitalField = typeof VITAL_FIELDS[number];
type Reading = Partial<Record<VitalField, unknown>>;

const given = (value: unknown) => value !== null && value !== undefined;

/** Why a reading can't be saved (11 §9): no vital at all, or half a blood pressure. Null if it's fine. */
export function vitalsProblem(reading: Reading): string | null {
    if (!VITAL_FIELDS.some(field => given(reading[field]))) return 'Enter at least one vital sign';
    if (given(reading.systolic) !== given(reading.diastolic)) return 'Blood pressure needs both systolic and diastolic';
    return null;
}

// A device or phone clock a little ahead of the server's isn't a reading from the future
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Why `takenAt` can't be right: before the patient arrived, or in the future. Null if it's fine. */
export function takenAtProblem(takenAt: Date, arrivedAt: Date, now: Date): string | null {
    if (takenAt.getTime() > now.getTime() + CLOCK_SKEW_MS) return "A reading can't be taken in the future";
    if (takenAt < arrivedAt) return 'A reading must be taken after the patient arrived';
    return null;
}

/**
 * A correction's new reading: the old reading with the changed fields applied (11 §9). A field sent
 * as null clears it; a field left out keeps the old value.
 */
export function correctedReading<T extends Reading & { takenAt: Date; notes: string | null }>(
    old: T, changes: Reading & { takenAt?: Date; notes?: string | null },
) {
    const merged = { takenAt: changes.takenAt ?? old.takenAt, notes: changes.notes !== undefined ? changes.notes : old.notes } as
        Record<VitalField, unknown> & { takenAt: Date; notes: string | null };
    for (const field of VITAL_FIELDS) merged[field] = changes[field] !== undefined ? changes[field] : old[field];
    return merged;
}

/** Why a re-triage can't be saved: the encounter was already triaged and no reason was given. */
export function retriageProblem(alreadyTriaged: boolean, changeReason?: string): string | null {
    return alreadyTriaged && !changeReason?.trim() ? 'Give a reason for re-triaging' : null;
}
