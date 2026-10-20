import { toDecimal } from '../ledger/ledger.service';
import { AccountEntryType, PaymentMode } from '@shared/enums/billing/billing.enums';
import { direction, transactionsWhere } from './account-transactions.rules';

describe('direction', () => {
    it('reads money in as a credit and money out as a debit', () => {
        expect(direction(toDecimal(5000))).toBe('CREDIT');
        expect(direction(toDecimal(-2000))).toBe('DEBIT');
    });
});

describe('transactionsWhere', () => {
    const base = { accountId: 'acc', account: { organizationId: 'org' } };

    it("lists only this account's rows, within the caller's hospital", () => {
        expect(transactionsWhere('acc', 'org', {})).toEqual(base);
    });

    it('filters by type, patient, payment mode, branch and dates', () => {
        const from = new Date('2026-10-01');
        const to = new Date('2026-10-20');
        expect(transactionsWhere('acc', 'org', {
            entryType: [AccountEntryType.DEPOSIT, AccountEntryType.REFUND],
            patientId: 'ada',
            modeOfPayment: [PaymentMode.POS],
            branchId: 'ikeja',
            from, to,
        })).toEqual({
            ...base,
            entryType: { in: ['DEPOSIT', 'REFUND'] },
            patientId: 'ada',
            modeOfPayment: { in: ['POS'] },
            branchId: 'ikeja',
            createdAt: { gte: from, lte: to },
        });
    });

    it('filters money in or out by sign', () => {
        expect(transactionsWhere('acc', 'org', { direction: 'CREDIT' }).amount).toEqual({ gte: 0 });
        expect(transactionsWhere('acc', 'org', { direction: 'DEBIT' }).amount).toEqual({ lt: 0 });
    });

    it('takes an open-ended date range', () => {
        const from = new Date('2026-10-01');
        expect(transactionsWhere('acc', 'org', { from }).createdAt).toEqual({ gte: from });
    });

    it('needs every search word to match the description, reference or patient', () => {
        const where = transactionsWhere('acc', 'org', { search: ' pos  4471 ' }) as { AND: { OR: unknown[] }[] };
        expect(where.AND).toHaveLength(2);
        expect(where.AND[0].OR).toContainEqual({ reference: { contains: 'pos', mode: 'insensitive' } });
        expect(where.AND[1].OR).toContainEqual({ patient: { patientNumber: 4471 } });
        expect(where.AND[0].OR).not.toContainEqual({ patient: { patientNumber: expect.anything() } });
    });

    it('ignores an empty search', () => {
        expect(transactionsWhere('acc', 'org', { search: '  ' })).toEqual(base);
    });
});
