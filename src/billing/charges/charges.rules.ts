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

type PayerAllocation = { amount: Prisma.Decimal; reviewStatus: string | null };

/**
 * What the payer covers of a charge, from its active PAYER allocation (one coverage per charge,
 * PRD 10 §5), or null when the payer covers none of it (self-pay, or not covered).
 */
export function payerShare(allocations: PayerAllocation[]) {
    if (!allocations.length) return null;
    return {
        amount:       allocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0)),
        reviewStatus: allocations[0].reviewStatus,
    };
}

type Party = { id: string; name: string };
export type AllocationRow = {
    id: string;
    responsibleType: string;            // ResponsibleType
    basis: string;                      // AllocationBasis
    amount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    paymentStatus: string;
    reviewStatus: string | null;
    billingAccount: { id: string; accountNumber: string; name: string; holderName: string | null } | null;
    coverage: { memberNumber: string | null; policy: { plan: Party & { payer: Party } } } | null;
};

/**
 * One share of a charge, with who owes it (PRD 10 §6.1): the patient's individual or family
 * account, a payer (with the plan and the patient's member number), or the hospital (written off).
 */
export function chargeShare(a: AllocationRow) {
    const share = {
        id:            a.id,
        owedBy:        a.responsibleType,
        basis:         a.basis,
        amount:        a.amount,
        paid:          a.paidAmount,
        outstanding:   Prisma.Decimal.max(a.amount.minus(a.paidAmount), 0),
        paymentStatus: a.paymentStatus,
    };
    if (a.responsibleType === 'ACCOUNT') return { ...share, account: a.billingAccount };
    if (a.responsibleType === 'PAYER' && a.coverage) {
        const { plan } = a.coverage.policy;
        return {
            ...share,
            payer:        plan.payer,
            plan:         { id: plan.id, name: plan.name },
            memberNumber: a.coverage.memberNumber,
            reviewStatus: a.reviewStatus,
        };
    }
    return share;   // HOSPITAL
}
