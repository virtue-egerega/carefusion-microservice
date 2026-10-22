import { Prisma } from '../../../generated/prisma/client';
import { firstTaskTargets, consultationFeeApplies, feeExemption, fundingShortfall, supersededDisposition, unsendable } from './start-encounter.rules';

describe('consultationFeeApplies', () => {
    it('charges a self-pay patient starting an encounter at a clinic (11 §10.4)', () => {
        expect(consultationFeeApplies({ coverageId: null, continuingSameClinic: false })).toBe(true);
    });

    it("doesn't charge an insured visit until payer allocation exists", () => {
        expect(consultationFeeApplies({ coverageId: 'coverage-1', continuingSameClinic: false })).toBe(false);
    });

    it("doesn't charge again when the patient continues their visit at the same clinic", () => {
        expect(consultationFeeApplies({ coverageId: null, continuingSameClinic: true })).toBe(false);
    });
});

describe('feeExemption', () => {
    it("says why a visit isn't charged, for reception to explain", () => {
        expect(feeExemption({ coverageId: null, continuingSameClinic: false })).toBeNull();
        expect(feeExemption({ coverageId: 'coverage-1', continuingSameClinic: false })).toBe('INSURED');
        expect(feeExemption({ coverageId: null, continuingSameClinic: true })).toBe('CONTINUING_SAME_CLINIC');
    });
});

describe('firstTaskTargets', () => {
    it("sends the patient to the clinic's nursing station when reception doesn't choose (11 §3.3)", () => {
        expect(firstTaskTargets(undefined, 'nursing')).toEqual(['nursing']);
        expect(firstTaskTargets([], 'nursing')).toEqual(['nursing']);
    });

    it('sends them to billing, the nursing station, or both, as reception chose', () => {
        expect(firstTaskTargets(['billing'], 'nursing')).toEqual(['billing']);
        expect(firstTaskTargets(['billing', 'nursing'], 'nursing')).toEqual(['billing', 'nursing']);
    });

    it('ignores a queue chosen twice', () => {
        expect(firstTaskTargets(['billing', 'billing'], 'nursing')).toEqual(['billing']);
    });
});

describe('unsendable', () => {
    it("always allows the clinic's own nursing station", () => {
        expect(unsendable(['nursing'], new Set(), 'nursing')).toEqual([]);
    });

    it("refuses queues that aren't on the receptionist's send lists", () => {
        expect(unsendable(['billing', 'pharmacy', 'nursing'], new Set(['billing']), 'nursing')).toEqual(['pharmacy']);
    });
});

describe('fundingShortfall', () => {
    const d = (v: number) => new Prisma.Decimal(v);
    const check = (policy: 'BEFORE' | 'AFTER', balance: number, maxUnpaid = 0) =>
        fundingShortfall({ policy, balance: d(balance), fee: d(5000), maxUnpaidBeforeHold: d(maxUnpaid) });

    it('BEFORE: starts when the account already holds the fee', () => {
        expect(check('BEFORE', 5000)).toBeNull();
        expect(check('BEFORE', 12000)).toBeNull();
    });

    it('BEFORE: needs the rest deposited, ignoring the unpaid threshold', () => {
        expect(check('BEFORE', 4000)?.toFixed(2)).toBe('1000.00');
        expect(check('BEFORE', 4000, 10000)?.toFixed(2)).toBe('1000.00');
    });

    it('BEFORE: older debts count against the fee', () => {
        // owes ₦2,000 already: needs ₦7,000 for a ₦5,000 fee
        expect(check('BEFORE', -2000)?.toFixed(2)).toBe('7000.00');
    });

    it('AFTER: starts while the debt stays within the threshold', () => {
        expect(check('AFTER', -3000, 10000)).toBeNull();   // → −8,000
        expect(check('AFTER', -5000, 10000)).toBeNull();   // → −10,000, exactly the threshold
    });

    it('AFTER: refuses past the threshold, saying how much to deposit', () => {
        expect(check('AFTER', -6000, 10000)?.toFixed(2)).toBe('1000.00');   // → −11,000
        expect(check('AFTER', 0)?.toFixed(2)).toBe('5000.00');              // threshold 0: like BEFORE
    });
});

describe('supersededDisposition', () => {
    it('left before completion once a clinician had seen them, otherwise without being seen', () => {
        expect(supersededDisposition(new Date())).toBe('LEFT_BEFORE_COMPLETION');
        expect(supersededDisposition(null)).toBe('LEFT_WITHOUT_BEING_SEEN');
    });
});
