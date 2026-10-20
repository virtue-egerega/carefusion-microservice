import type { Prisma } from '../../../generated/prisma/client';

/** The cashier's queue: billing tasks live here (11 §6.1). */
export const CASHIER_QUEUE_KEY = 'CASHIER_QUEUE';
/** A billing task for a visit's charges (and any fees outside a visit). */
export const ENCOUNTER_BILL = 'ENCOUNTER_BILL';
/** A billing task for fees outside any visit: registration and card fees. */
export const REGISTRATION_BILL = 'REGISTRATION_BILL';

/** What deciding a payment hold needs to know about the visit, the patient's account and the hospital's policy. */
export type HoldContext = {
    policy: 'BEFORE' | 'AFTER';            // Organization.consultationPayment
    emergency: boolean;                    // the encounter is in the Emergency department
    inpatient: boolean;
    encounterUnpaid: Prisma.Decimal;       // what the patient's own share of this visit's charges still owes
    accountDebt: Prisma.Decimal;           // what the account owes overall (−balance)
    creditLimit: Prisma.Decimal;           // the account's own credit limit
    maxUnpaidBeforeHold: Prisma.Decimal;   // the hospital's tolerance on top of it
};

/**
 * Whether a task on a clinic's doctors' list waits for payment (11 §6). Only when the hospital
 * collects before consultation, never in an emergency or for an admitted patient, only while this
 * visit's bill is unpaid, and only once the account owes more than its credit limit plus the
 * hospital's tolerance. Vitals, triage and billing are never held.
 */
export function holdsConsultation(c: HoldContext): boolean {
    if (c.policy === 'AFTER' || c.emergency || c.inpatient) return false;
    if (c.encounterUnpaid.lte(0)) return false;
    return c.accountDebt.gt(c.creditLimit.plus(c.maxUnpaidBeforeHold));
}

/** An active task on the cashier's list for the patient at this branch. */
export type BillingTask = { id: string; encounterId: string | null };

export type BillingTaskPlan =
    | { action: 'keep'; taskId: string }      // already on the cashier's list for this
    | { action: 'adopt'; taskId: string }     // the registration task becomes the visit's billing task
    | { action: 'create' };

/**
 * What to do with the cashier's list when the patient owes money (11 §6.1): the patient is on it
 * once. A visit's charge goes on the visit's billing task; if the patient is still on the list for
 * their registration fees, that task becomes the visit's, so the cashier collects both together.
 * A charge outside any visit (registration) needs only that the patient is on the list at all.
 */
export function planBillingTask(active: BillingTask[], encounterId: string | null): BillingTaskPlan {
    if (!encounterId) return active.length ? { action: 'keep', taskId: active[0].id } : { action: 'create' };

    const visits = active.find(t => t.encounterId === encounterId);
    if (visits) return { action: 'keep', taskId: visits.id };
    const registration = active.find(t => t.encounterId === null);
    if (registration) return { action: 'adopt', taskId: registration.id };
    return { action: 'create' };
}
