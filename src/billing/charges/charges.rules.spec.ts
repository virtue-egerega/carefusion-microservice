import { Prisma } from '../../../generated/prisma/client';
import { chargeShare, patientShare, payerShare } from './charges.rules';

const share = (amount: number, paidAmount: number) => ({ amount: new Prisma.Decimal(amount), paidAmount: new Prisma.Decimal(paidAmount) });

describe('patientShare', () => {
    it('shows an unpaid registration fee as owed in full', () => {
        const s = patientShare([share(2000, 0)]);
        expect(s.outstanding.toNumber()).toBe(2000);
        expect(s.paymentStatus).toBe('UNPAID');
    });

    it('shows what is left after a part payment', () => {
        const s = patientShare([share(5000, 3000)]);
        expect(s.paid.toNumber()).toBe(3000);
        expect(s.outstanding.toNumber()).toBe(2000);
        expect(s.paymentStatus).toBe('PART_PAID');
    });

    it('shows a settled charge as paid', () => {
        expect(patientShare([share(5000, 5000)]).paymentStatus).toBe('PAID');
    });

    it('adds up a charge split across allocations', () => {
        const s = patientShare([share(1000, 1000), share(500, 0)]);
        expect(s.amount.toNumber()).toBe(1500);
        expect(s.outstanding.toNumber()).toBe(500);
        expect(s.paymentStatus).toBe('PART_PAID');
    });

    it('has nothing to collect when the patient owes no share (covered or free)', () => {
        expect(patientShare([]).paymentStatus).toBe('NOT_APPLICABLE');
        expect(patientShare([share(0, 0)]).paymentStatus).toBe('NOT_APPLICABLE');
    });
});

describe('payerShare', () => {
    const d = (v: number) => new Prisma.Decimal(v);

    it('is null when the payer covers none of the charge (self-pay, not covered)', () => {
        expect(payerShare([])).toBeNull();
    });

    it("gives the payer's amount and where its review stands", () => {
        const share = payerShare([{ amount: d(13500), reviewStatus: 'PENDING_AUTH' }]);
        expect(share?.amount.toFixed(2)).toBe('13500.00');
        expect(share?.reviewStatus).toBe('PENDING_AUTH');
    });
});

describe('chargeShare', () => {
    const d = (v: number) => new Prisma.Decimal(v);
    const row = (over: Partial<Parameters<typeof chargeShare>[0]> = {}) => ({
        id: 'alloc-1', responsibleType: 'ACCOUNT', basis: 'NOT_COVERED', amount: d(15000), paidAmount: d(5000),
        paymentStatus: 'PART_PAID', reviewStatus: null, billingAccount: null, coverage: null,
        ...over,
    });

    it("names the patient's account and what is still owed on it", () => {
        const account = { id: 'acc-1', accountNumber: 'FAM-0042', name: 'Okafor Family', holderName: 'John Okafor' };
        const share = chargeShare(row({ billingAccount: account }));
        expect(share).toMatchObject({ owedBy: 'ACCOUNT', account, paymentStatus: 'PART_PAID' });
        expect(share.outstanding.toFixed(2)).toBe('10000.00');
    });

    it('names the payer, plan and member number, with where the review stands', () => {
        const share = chargeShare(row({
            responsibleType: 'PAYER', basis: 'COVERED', paidAmount: d(0), paymentStatus: 'UNPAID', reviewStatus: 'PENDING_AUTH',
            coverage: { memberNumber: 'HYG/123', policy: { plan: { id: 'plan-1', name: 'Silver', payer: { id: 'payer-1', name: 'Hygeia' } } } },
        }));
        expect(share).toMatchObject({
            owedBy: 'PAYER', payer: { id: 'payer-1', name: 'Hygeia' }, plan: { id: 'plan-1', name: 'Silver' },
            memberNumber: 'HYG/123', reviewStatus: 'PENDING_AUTH',
        });
        expect(share.outstanding.toFixed(2)).toBe('15000.00');
    });

    it("leaves a hospital write-off with no party, and never shows a negative outstanding", () => {
        const share = chargeShare(row({ responsibleType: 'HOSPITAL', basis: 'WRITTEN_OFF', paidAmount: d(16000) }));
        expect(share).not.toHaveProperty('account');
        expect(share).not.toHaveProperty('payer');
        expect(share.outstanding.toFixed(2)).toBe('0.00');
    });
});
