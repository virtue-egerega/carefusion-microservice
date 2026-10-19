export type FeeExemption = 'INSURED' | 'CONTINUING_SAME_CLINIC';

/**
 * Why starting the encounter wouldn't charge this visit the consultation fee (11 §10.4), or null if it would.
 * Every clinic visit carries it, except: an insured visit, until payer allocation exists (10 step
 * 4); and a patient continuing an open encounter at the same clinic, who was already charged.
 */
export function feeExemption(visit: { coverageId: string | null; continuingSameClinic: boolean }): FeeExemption | null {
    if (visit.coverageId) return 'INSURED';
    if (visit.continuingSameClinic) return 'CONTINUING_SAME_CLINIC';
    return null;
}

/** Whether starting the encounter charges the consultation fee. */
export function consultationFeeApplies(visit: { coverageId: string | null; continuingSameClinic: boolean }): boolean {
    return feeExemption(visit) === null;
}

/**
 * Where starting the encounter sends the patient (11 §3.3): the queues reception chose (billing, the nursing
 * station, or both), else the clinic's nursing station. Duplicates are dropped.
 */
export function firstTaskTargets(chosen: string[] | undefined, nursingStationId: string): string[] {
    return chosen?.length ? [...new Set(chosen)] : [nursingStationId];
}

/**
 * The chosen queues reception may not send to: anything but the clinic's own nursing station must
 * be on one of their duty profiles' send lists.
 */
export function unsendable(targets: string[], sendable: Set<string>, nursingStationId: string): string[] {
    return targets.filter(id => id !== nursingStationId && !sendable.has(id));
}
