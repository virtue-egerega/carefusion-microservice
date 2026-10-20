import type { Prisma } from '../../../generated/prisma/client';
import type { AccountTransactionsQueryDto } from '@shared/contracts/billing';

type Filters = Omit<AccountTransactionsQueryDto, 'limit' | 'offset'>;

/** Credits are money in (+), debits money out (−) (PRD 10 §3.3). */
export function direction(amount: Prisma.Decimal): 'CREDIT' | 'DEBIT' {
    return amount.isNegative() ? 'DEBIT' : 'CREDIT';
}

/**
 * The ledger rows of one account matching the filters. Search: every word must match the
 * description, the payment reference or the patient's name; a number also matches the patient
 * number. "pos 4471" finds a POS slip; "ada consult" finds Ada's consultation fee.
 */
export function transactionsWhere(accountId: string, organizationId: string, f: Filters): Prisma.AccountEntryWhereInput {
    const insensitive = (word: string) => ({ contains: word, mode: 'insensitive' as const });
    const words = f.search?.trim().split(/\s+/).filter(Boolean) ?? [];

    return {
        accountId,
        account: { organizationId },
        ...(f.entryType?.length && { entryType: { in: f.entryType } }),
        ...(f.direction && { amount: f.direction === 'CREDIT' ? { gte: 0 } : { lt: 0 } }),
        ...(f.patientId && { patientId: f.patientId }),
        ...(f.modeOfPayment?.length && { modeOfPayment: { in: f.modeOfPayment } }),
        ...(f.branchId && { branchId: f.branchId }),
        ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
        ...(words.length && {
            AND: words.map(word => ({
                OR: [
                    { description: insensitive(word) },
                    { reference:   insensitive(word) },
                    { patient: { user: { firstName:  insensitive(word) } } },
                    { patient: { user: { middleName: insensitive(word) } } },
                    { patient: { user: { lastName:   insensitive(word) } } },
                    ...(/^\d{1,9}$/.test(word) ? [{ patient: { patientNumber: Number(word) } }] : []),
                ],
            })),
        }),
    };
}
