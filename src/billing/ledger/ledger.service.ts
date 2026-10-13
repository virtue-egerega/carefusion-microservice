import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import type { BillingAccount } from '../../../generated/prisma/client';

type Decimal = Prisma.Decimal;
export const toDecimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
const ZERO = toDecimal(0);

// Credits that are real money available to pay bills (PRD 10 §7.1). WRITE_OFF credits are not:
// they settle the allocation they forgive directly.
const SPENDABLE_CREDITS: $Enums.AccountEntryType[] = [
    $Enums.AccountEntryType.DEPOSIT,
    $Enums.AccountEntryType.REMITTANCE,
    $Enums.AccountEntryType.TRANSFER_IN,
];

export type PostEntryInput = {
    accountId: string;
    entryType: $Enums.AccountEntryType;
    amount: Decimal;                       // signed: + credit, − debit
    description: string;
    branchId: string;
    createdBy: string;
    patientId?: string;
    allocationId?: string;
    requestId?: string;
    reversesId?: string;
    modeOfPayment?: $Enums.PaymentMode;
    reference?: string;
};

export type ApplyCreditInput = {
    accountId: string;
    appliedBy: string;
    targetAllocationIds?: string[];        // paid first, in this order; remainder goes oldest-first
};

type Credit = { id: string; amount: Decimal; appliedAmount: Decimal };
type Payable = { id: string; amount: Decimal; paidAmount: Decimal };

/**
 * Pairs credits (oldest first) with allocations (in the order given) until one side runs out.
 * Updates appliedAmount / paidAmount on the passed objects and returns the pairings.
 */
export function matchCreditsToAllocations(credits: Credit[], allocations: Payable[]) {
    const applications: { creditEntryId: string; allocationId: string; amount: Decimal }[] = [];
    let creditIdx = 0;

    for (const allocation of allocations) {
        let due = allocation.amount.minus(allocation.paidAmount);

        while (due.gt(ZERO) && creditIdx < credits.length) {
            const credit = credits[creditIdx];
            const available = credit.amount.minus(credit.appliedAmount);
            const pay = Prisma.Decimal.min(due, available);

            applications.push({ creditEntryId: credit.id, allocationId: allocation.id, amount: pay });
            credit.appliedAmount = credit.appliedAmount.plus(pay);
            allocation.paidAmount = allocation.paidAmount.plus(pay);
            due = due.minus(pay);
            if (available.minus(pay).lte(ZERO)) creditIdx++;
        }
        if (creditIdx >= credits.length) break;
    }

    return applications;
}

/**
 * The only writer of AccountEntry and of BillingAccount.balance / unappliedCredit.
 * Writes happen on a locked account row, so concurrent postings on one account serialise.
 * Methods accept an account the caller has already locked in this transaction (and returns the
 * updated one) so a chain of postings doesn't re-read it.
 */
@Injectable()
export class LedgerService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * SELECT … FOR UPDATE in one round trip; the lock is held until the transaction ends.
     * With organizationId, an account from another organisation is reported as not found.
     */
    async lockAccount(accountId: string, organizationId?: string): Promise<BillingAccount> {
        const client = this.databaseService.client;
        const rows = await client.$queryRaw<BillingAccount[]>`
            SELECT * FROM "BillingAccount"
            WHERE "id" = ${accountId}
              AND (${organizationId ?? null}::text IS NULL OR "organizationId" = ${organizationId ?? null})
            FOR UPDATE`;
        if (!rows.length) throw new NotFoundException('Billing account not found');

        // Normalise numeric columns regardless of how the driver returns them
        const row = rows[0];
        return {
            ...row,
            balance:         toDecimal(row.balance),
            unappliedCredit: toDecimal(row.unappliedCredit),
            creditLimit:     toDecimal(row.creditLimit),
        };
    }

    async postEntry(input: PostEntryInput, locked?: BillingAccount) {
        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            const account = locked ?? await this.lockAccount(input.accountId);
            const balanceAfter = account.balance.plus(input.amount);

            const entry = await client.accountEntry.create({
                data: {
                    accountId:     input.accountId,
                    entryType:     input.entryType,
                    amount:        input.amount,
                    balanceAfter,
                    patientId:     input.patientId,
                    allocationId:  input.allocationId,
                    requestId:     input.requestId,
                    reversesId:    input.reversesId,
                    modeOfPayment: input.modeOfPayment,
                    reference:     input.reference,
                    description:   input.description,
                    branchId:      input.branchId,
                    createdBy:     input.createdBy,
                },
            });

            const updated = await client.billingAccount.update({
                where: { id: input.accountId },
                data: {
                    balance: balanceAfter,
                    ...(SPENDABLE_CREDITS.includes(input.entryType) && {
                        unappliedCredit: { increment: input.amount },
                    }),
                },
            });

            return { entry, account: updated };
        });
    }

    /**
     * Pays the account's open allocations from its unapplied credit (PRD 10 §7.1):
     * targeted allocations first, then oldest first. Credit entries are consumed oldest first,
     * and each pairing is recorded as a PaymentApplication.
     */
    async applyCredit(input: ApplyCreditInput, locked?: BillingAccount) {
        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            const account = locked ?? await this.lockAccount(input.accountId);
            const nothing = { applied: ZERO, applications: [], account };
            if (account.unappliedCredit.lte(ZERO)) return nothing;

            const allocations = await this.openAllocationsInPayOrder(input.accountId, input.targetAllocationIds ?? []);
            if (!allocations.length) return nothing;

            const credits = await client.accountEntry.findMany({
                where: {
                    accountId: input.accountId,
                    entryType: { in: SPENDABLE_CREDITS },
                    appliedAmount: { lt: client.accountEntry.fields.amount },
                },
                orderBy: { createdAt: 'asc' },
            });

            // Mutates paidAmount / appliedAmount on the loaded rows; persisted below
            const applications = matchCreditsToAllocations(credits, allocations);
            if (!applications.length) return nothing;

            await client.paymentApplication.createMany({
                data: applications.map(a => ({ ...a, appliedBy: input.appliedBy })),
            });

            const touchedCredits = new Set(applications.map(a => a.creditEntryId));
            for (const credit of credits.filter(c => touchedCredits.has(c.id))) {
                await client.accountEntry.update({
                    where: { id: credit.id },
                    data:  { appliedAmount: credit.appliedAmount },
                });
            }

            const touchedAllocations = new Set(applications.map(a => a.allocationId));
            for (const allocation of allocations.filter(a => touchedAllocations.has(a.id))) {
                await client.chargeAllocation.update({
                    where: { id: allocation.id },
                    data: {
                        paidAmount:    allocation.paidAmount,
                        paymentStatus: allocation.paidAmount.gte(allocation.amount)
                            ? $Enums.PaymentStatus.PAID
                            : $Enums.PaymentStatus.PART_PAID,
                    },
                });
            }

            const applied = applications.reduce((sum, a) => sum.plus(a.amount), ZERO);
            const updated = await client.billingAccount.update({
                where: { id: input.accountId },
                data:  { unappliedCredit: { decrement: applied } },
            });

            return { applied, applications, account: updated };
        });
    }

    /** Unpaid allocations billed to this account that are payable now, in the order they get paid. */
    private async openAllocationsInPayOrder(accountId: string, targetIds: string[]) {
        const open = await this.databaseService.client.chargeAllocation.findMany({
            where: {
                billingAccountId: accountId,
                state: $Enums.AllocationState.ACTIVE,
                paymentStatus: { in: [$Enums.PaymentStatus.UNPAID, $Enums.PaymentStatus.PART_PAID] },
                // Payer lines are payable once approved; pending/rejected ones are not (PRD 10 §7.3)
                OR: [{ reviewStatus: null }, { reviewStatus: $Enums.ReviewStatus.APPROVED }],
            },
            orderBy: { createdAt: 'asc' },
        });

        const byId = new Map(open.map(a => [a.id, a]));
        const missing = targetIds.filter(id => !byId.has(id));
        if (missing.length) {
            throw new BadRequestException(`Not open bills on this account: ${missing.join(', ')}`);
        }

        const targets = targetIds.map(id => byId.get(id)!);
        return [...targets, ...open.filter(a => !targetIds.includes(a.id))];
    }
}
