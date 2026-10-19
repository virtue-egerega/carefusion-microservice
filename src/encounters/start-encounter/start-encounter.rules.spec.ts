import { firstTaskTargets, consultationFeeApplies, feeExemption, unsendable } from './start-encounter.rules';

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
