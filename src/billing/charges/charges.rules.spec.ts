import { Prisma } from '../../../generated/prisma/client';
import { patientShare } from './charges.rules';

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
