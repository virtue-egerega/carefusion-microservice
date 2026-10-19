import type { Prisma } from '../../../generated/prisma/client';

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
