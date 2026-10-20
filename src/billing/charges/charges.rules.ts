import { Prisma } from '../../../generated/prisma/client';

type Share = { amount: Prisma.Decimal; paidAmount: Prisma.Decimal };
type PaymentStatus = 'UNPAID' | 'PART_PAID' | 'PAID' | 'NOT_APPLICABLE';

/**
 * What the patient's own account owes for a charge, from its active ACCOUNT allocations (PRD 10
 * §6.1). A charge with none (fully covered, or free) is NOT_APPLICABLE: nothing to collect.
 */
export function patientShare(allocations: Share[]) {
    const amount = allocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0));
    const paid = allocations.reduce((sum, a) => sum.plus(a.paidAmount), new Prisma.Decimal(0));
    const outstanding = Prisma.Decimal.max(amount.minus(paid), 0);

    const paymentStatus: PaymentStatus = !allocations.length || amount.isZero() ? 'NOT_APPLICABLE'
        : outstanding.isZero() ? 'PAID'
        : paid.gt(0)           ? 'PART_PAID'
        :                        'UNPAID';
    return { amount, paid, outstanding, paymentStatus };
}
