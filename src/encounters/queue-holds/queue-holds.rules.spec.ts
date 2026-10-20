import { toDecimal } from '../../billing/ledger/ledger.service';
import { HoldContext, holdsConsultation, planBillingTask } from './queue-holds.rules';

// A self-pay outpatient at a clinic who owes ₦5,000 for this visit and has no credit
const owing = (overrides: Partial<Record<keyof HoldContext, unknown>> = {}): HoldContext => ({
    policy:              'BEFORE',
    emergency:           false,
    inpatient:           false,
    encounterUnpaid:     toDecimal(5000),
    accountDebt:         toDecimal(5000),
    creditLimit:         toDecimal(0),
    maxUnpaidBeforeHold: toDecimal(0),
    ...overrides,
} as HoldContext);

describe('holdsConsultation', () => {
    it("holds the doctor's task until the visit is paid when the hospital collects first (11 §6)", () => {
        expect(holdsConsultation(owing())).toBe(true);
    });

    it('never holds when the hospital lets patients pay at the end', () => {
        expect(holdsConsultation(owing({ policy: 'AFTER' }))).toBe(false);
    });

    it('never holds in an emergency, or an admitted patient', () => {
        expect(holdsConsultation(owing({ emergency: true }))).toBe(false);
        expect(holdsConsultation(owing({ inpatient: true }))).toBe(false);
    });

    it("doesn't hold once this visit is paid, even if the account owes for something else", () => {
        expect(holdsConsultation(owing({ encounterUnpaid: toDecimal(0), accountDebt: toDecimal(20000) }))).toBe(false);
    });

    it("doesn't hold while the account owes no more than its credit limit plus the hospital's tolerance", () => {
        expect(holdsConsultation(owing({ creditLimit: toDecimal(3000), maxUnpaidBeforeHold: toDecimal(2000) }))).toBe(false);
        expect(holdsConsultation(owing({ creditLimit: toDecimal(3000), maxUnpaidBeforeHold: toDecimal(1999.99) }))).toBe(true);
    });
});

describe('planBillingTask', () => {
    it("puts a newly registered patient on the cashier's list for their fees", () => {
        expect(planBillingTask([], null)).toEqual({ action: 'create' });
    });

    it('keeps the patient on the list once, however many registration fees post', () => {
        expect(planBillingTask([{ id: 'reg', encounterId: null }], null)).toEqual({ action: 'keep', taskId: 'reg' });
    });

    it('turns the registration task into the visit\'s billing task when the consultation fee posts', () => {
        expect(planBillingTask([{ id: 'reg', encounterId: null }], 'visit')).toEqual({ action: 'adopt', taskId: 'reg' });
    });

    it("puts a visit's first charge on a new billing task", () => {
        expect(planBillingTask([], 'visit')).toEqual({ action: 'create' });
    });

    it("adds later charges in the visit (lab, pharmacy) to the visit's billing task", () => {
        expect(planBillingTask([{ id: 'bill', encounterId: 'visit' }], 'visit')).toEqual({ action: 'keep', taskId: 'bill' });
    });

    it("keeps a fee outside the visit on the visit's billing task, which collects it too", () => {
        expect(planBillingTask([{ id: 'bill', encounterId: 'visit' }], null)).toEqual({ action: 'keep', taskId: 'bill' });
    });
});
