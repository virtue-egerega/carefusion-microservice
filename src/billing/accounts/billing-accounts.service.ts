import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import type { BillingAccount } from '../../../generated/prisma/client';
import { CreateFamilyAccountDto, DepositDto, UpdateBillingAccountDto } from '@shared/contracts/billing';
import { LedgerService, toDecimal } from '../ledger/ledger.service';

const ACCOUNT_SUMMARY = {
    id: true, accountNumber: true, accountType: true, name: true, status: true,
    balance: true, unappliedCredit: true, creditLimit: true,
};

const MEMBER_PATIENT = {
    select: {
        id: true, patientId: true,
        user: { select: { firstName: true, middleName: true, lastName: true, phone: true } },
    },
};

const OPEN_ACCOUNT_BILLS = {
    state: $Enums.AllocationState.ACTIVE,
    responsibleType: $Enums.ResponsibleType.ACCOUNT,
    paymentStatus: { in: [$Enums.PaymentStatus.UNPAID, $Enums.PaymentStatus.PART_PAID] },
};

export type NewPatientAccountInput = {
    patientId: string;
    organizationId: string;
    name: string;
    phone: string[];
};

/** All reads/writes are scoped to the caller's organisation (from the JWT). */
@Injectable()
export class BillingAccountsService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly ledger: LedgerService,
    ) {}

    // ── Accounts ─────────────────────────────────────────────────────────────

    /** Registration (PRD 10 §3.2): a new patient's own account + membership, in one insert. */
    async openIndividualForPatient(input: NewPatientAccountInput, createdBy: string) {
        return this.databaseService.client.billingAccount.create({
            data: {
                organizationId:  input.organizationId,
                accountNumber:   await this.nextAccountNumber(),
                accountType:     $Enums.BillingAccountType.INDIVIDUAL,
                name:            input.name,
                holderPatientId: input.patientId,
                holderPhone:     input.phone,
                updatedBy:       createdBy,
                members:         { create: { patientId: input.patientId, createdBy } },
            },
            select: ACCOUNT_SUMMARY,
        });
    }

    async createFamily(dto: CreateFamilyAccountDto, organizationId: string, createdBy: string) {
        if (!dto.holderPatientId && !dto.holderName) {
            throw new BadRequestException('Provide holderPatientId or holderName');
        }

        return this.databaseService.transaction(async () => {
            const account = await withConstraintErrors(
                async () => this.databaseService.client.billingAccount.create({
                    data: {
                        organizationId,
                        accountNumber:   await this.nextAccountNumber(),
                        accountType:     $Enums.BillingAccountType.FAMILY,
                        name:            dto.name,
                        holderPatientId: dto.holderPatientId,
                        holderName:      dto.holderName,
                        holderPhone:     dto.holderPhone ?? [],
                        updatedBy:       createdBy,
                    },
                }),
                { notFound: 'Holder patient not found' },
            );

            if (dto.holderPatientId) await this.moveMember(account, dto.holderPatientId, createdBy, organizationId);
            return account;
        });
    }

    async findAll(organizationId: string, limit = 20, offset = 0, search?: string, accountType?: $Enums.BillingAccountType) {
        const where: any = { organizationId, ...(accountType && { accountType }) };
        if (search) {
            where.OR = [
                { name:          { contains: search, mode: 'insensitive' } },
                { accountNumber: { contains: search, mode: 'insensitive' } },
                { holderName:    { contains: search, mode: 'insensitive' } },
            ];
        }

        const client = this.databaseService.client;
        const [count, docs] = await client.$transaction([
            client.billingAccount.count({ where }),
            client.billingAccount.findMany({
                where, take: limit, skip: offset, orderBy: { createdAt: 'desc' },
                select: { ...ACCOUNT_SUMMARY, _count: { select: { members: { where: { leftAt: null } } } } },
            }),
        ]);
        return { count, docs };
    }

    async findOne(accountId: string, organizationId: string) {
        const client = this.databaseService.client;
        const [account, open] = await Promise.all([
            client.billingAccount.findFirst({
                where: { id: accountId, organizationId },
                include: {
                    members: { where: { leftAt: null }, include: { patient: MEMBER_PATIENT } },
                    payer:   { select: { id: true, name: true } },
                },
            }),
            client.chargeAllocation.findMany({
                where:  { billingAccountId: accountId, ...OPEN_ACCOUNT_BILLS },
                select: { amount: true, paidAmount: true },
            }),
        ]);
        if (!account) throw new NotFoundException('Billing account not found');

        const outstanding = open.reduce((sum, a) => sum.plus(a.amount.minus(a.paidAmount)), toDecimal(0));
        return { ...account, outstanding };
    }

    async updateDetails(accountId: string, dto: UpdateBillingAccountDto, organizationId: string, updatedBy: string) {
        const { count } = await this.databaseService.client.billingAccount.updateMany({
            where: { id: accountId, organizationId },
            data:  { name: dto.name, holderName: dto.holderName, holderPhone: dto.holderPhone, updatedBy },
        });
        if (!count) throw new NotFoundException('Billing account not found');
        return { message: 'Billing account updated' };
    }

    // ── Members ──────────────────────────────────────────────────────────────

    /**
     * Moves a patient onto a FAMILY account (PRD 10 §3.2). Closes their current membership; past
     * charges stay on the account that was billed. An emptied INDIVIDUAL account with nothing
     * owed either way is closed. Pass the account if already loaded.
     */
    async moveMember(target: string | BillingAccount, patientId: string, by: string, organizationId: string) {
        return this.databaseService.transaction(async () => {
            const client  = this.databaseService.client;
            const account = typeof target === 'string' ? await this.findAccountOrThrow(target, organizationId) : target;
            if (account.accountType !== $Enums.BillingAccountType.FAMILY) {
                throw new BadRequestException('Patients can only be moved onto a FAMILY account');
            }
            if (account.status !== $Enums.AccountStatus.ACTIVE) throw new ConflictException('Account is not active');

            const current = await this.currentMembership(patientId);
            if (current?.accountId === account.id) throw new ConflictException('Patient is already on this account');

            if (current) {
                await client.billingAccountMember.update({ where: { id: current.id }, data: { leftAt: new Date() } });
                await this.closeIfEmptyIndividual(current.account, by);
            }
            return withConstraintErrors(
                () => client.billingAccountMember.create({ data: { accountId: account.id, patientId, createdBy: by } }),
                { notFound: 'Patient not found' },
            );
        });
    }

    /** A patient can never be without an account: leaving a family returns them to their own. */
    async removeMember(accountId: string, patientId: string, by: string, organizationId: string) {
        return this.databaseService.transaction(async () => {
            const client  = this.databaseService.client;
            const current = await this.currentMembership(patientId);
            if (current?.accountId !== accountId || current.account.organizationId !== organizationId) {
                throw new NotFoundException('Patient is not a current member of this account');
            }
            if (current.account.accountType !== $Enums.BillingAccountType.FAMILY) {
                throw new BadRequestException('A patient cannot be removed from their own account');
            }

            await client.billingAccountMember.update({ where: { id: current.id }, data: { leftAt: new Date() } });

            // Reuse their previous individual account if there is one, else open a new one
            const previous = await client.billingAccount.findFirst({
                where: { holderPatientId: patientId, accountType: $Enums.BillingAccountType.INDIVIDUAL },
                orderBy: { createdAt: 'desc' },
            });
            if (previous) {
                await client.billingAccount.update({
                    where: { id: previous.id },
                    data:  {
                        status:    $Enums.AccountStatus.ACTIVE,
                        updatedBy: by,
                        members:   { create: { patientId, createdBy: by } },
                    },
                });
                return { message: 'Patient returned to their own account', accountId: previous.id };
            }

            const patient = await client.patient.findUniqueOrThrow({
                where: { id: patientId },
                select: { user: { select: { firstName: true, lastName: true, phone: true } } },
            });
            const opened = await this.openIndividualForPatient({
                patientId,
                organizationId,
                name:  `${patient.user.firstName} ${patient.user.lastName}`,
                phone: patient.user.phone,
            }, by);
            return { message: 'Patient moved to a new individual account', accountId: opened.id };
        });
    }

    // ── Money ────────────────────────────────────────────────────────────────

    /** PRD 10 §7.2: record the deposit, then pay targeted bills, then the oldest unpaid ones. */
    /** `at.branchId` is the cashier's branch, from their token. */
    async deposit(accountId: string, dto: DepositDto, at: { organizationId: string; branchId: string }, receivedBy: string) {
        return this.databaseService.transaction(async () => {
            const account = await this.ledger.lockAccount(accountId, at.organizationId);
            if (account.accountType === $Enums.BillingAccountType.PAYER) {
                throw new BadRequestException('Payer payments are recorded as remittances');
            }
            if (account.status === $Enums.AccountStatus.CLOSED) throw new ConflictException('Account is closed');

            const posted = await withConstraintErrors(
                () => this.ledger.postEntry({
                    accountId,
                    entryType:     $Enums.AccountEntryType.DEPOSIT,
                    amount:        toDecimal(dto.amount),
                    modeOfPayment: dto.modeOfPayment,
                    reference:     dto.reference,
                    description:   'Deposit',
                    branchId:      at.branchId,
                    createdBy:     receivedBy,
                }, account),
                { notFound: 'Branch not found' },
            );
            const paid = await this.ledger.applyCredit({
                accountId,
                appliedBy: receivedBy,
                targetAllocationIds: dto.targetAllocationIds,
            }, posted.account);

            return {
                entry:        posted.entry,
                applied:      paid.applied,
                applications: paid.applications,
                account:      { balance: paid.account.balance, unappliedCredit: paid.account.unappliedCredit },
            };
        });
    }

    async statement(accountId: string, organizationId: string, filters: { from?: Date; to?: Date; patientId?: string }) {
        const client = this.databaseService.client;
        const createdAt = (filters.from || filters.to) ? { gte: filters.from, lte: filters.to } : undefined;
        const account = { id: accountId, organizationId };

        const [entries, openBills] = await Promise.all([
            client.accountEntry.findMany({
                where: {
                    accountId, account,
                    ...(createdAt && { createdAt }),
                    ...(filters.patientId && { patientId: filters.patientId }),
                },
                orderBy: { createdAt: 'asc' },
                include: { allocation: { select: { id: true, basis: true, charge: { select: { description: true, category: true } } } } },
            }),
            client.chargeAllocation.findMany({
                where: {
                    billingAccountId: accountId, billingAccount: account, ...OPEN_ACCOUNT_BILLS,
                    ...(filters.patientId && { charge: { patientId: filters.patientId } }),
                },
                orderBy: { createdAt: 'asc' },
                include: { charge: { select: { id: true, patientId: true, description: true, category: true, createdAt: true } } },
            }),
        ]);

        return { entries, openBills };
    }

    // ── Lookups used by other modules ────────────────────────────────────────

    async currentMembership(patientId: string) {
        return this.databaseService.client.billingAccountMember.findFirst({
            where:   { patientId, leftAt: null },
            include: { account: true },
        });
    }

    /** The account a patient's new charges go to. Every patient has one (PRD 10 §3.2). */
    async currentAccountIdOrThrow(patientId: string) {
        const membership = await this.databaseService.client.billingAccountMember.findFirst({
            where: { patientId, leftAt: null }, select: { accountId: true },
        });
        if (!membership) throw new ConflictException('Patient has no billing account');
        return membership.accountId;
    }

    async getForPatient(patientId: string, organizationId: string) {
        return this.findOne(await this.currentAccountIdOrThrow(patientId), organizationId);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async closeIfEmptyIndividual(account: BillingAccount, by: string) {
        if (account.accountType !== $Enums.BillingAccountType.INDIVIDUAL) return;
        // Money still on or owed to the account keeps it open until refunded/transferred/settled
        if (!account.balance.isZero() || !account.unappliedCredit.isZero()) return;

        const client  = this.databaseService.client;
        const members = await client.billingAccountMember.count({ where: { accountId: account.id, leftAt: null } });
        if (members > 0) return;

        await client.billingAccount.update({
            where: { id: account.id },
            data:  { status: $Enums.AccountStatus.CLOSED, updatedBy: by },
        });
    }

    async nextAccountNumber() {
        const [{ nextval }] = await this.databaseService.client.$queryRaw<{ nextval: bigint }[]>`
            SELECT nextval('billing_account_number_seq')`;
        return `BA-${nextval.toString().padStart(6, '0')}`;
    }

    private async findAccountOrThrow(accountId: string, organizationId: string) {
        const account = await this.databaseService.client.billingAccount.findFirst({ where: { id: accountId, organizationId } });
        if (!account) throw new NotFoundException('Billing account not found');
        return account;
    }
}
