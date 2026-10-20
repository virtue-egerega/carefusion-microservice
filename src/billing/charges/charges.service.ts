import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import type { BillingAccount } from '../../../generated/prisma/client';
import { BillingAccountsService } from '../accounts/billing-accounts.service';
import { LedgerService, toDecimal } from '../ledger/ledger.service';
import { QueueHoldsService } from '../../encounters/queue-holds/queue-holds.service';
import { patientShare } from './charges.rules';

export type PostChargeInput = {
    patientId: string;
    branchId: string;
    category: $Enums.ServiceCategory;
    description: string;
    unitPrice: number | string;
    quantity?: number;
    sourceType: string;                    // "PATIENT_REGISTRATION", "LAB_ORDER", ...
    sourceId: string;
    appointmentId?: string;
    encounterId?: string;                  // the visit it was incurred in (11 §17)
    coverageId?: string;
    billingAccountId?: string;             // pass when the caller already knows it
    createdBy: string;
};

// The patient's own account's share of a charge; payer shares are the insurer's business
const ACCOUNT_SHARE = { responsibleType: $Enums.ResponsibleType.ACCOUNT, state: $Enums.AllocationState.ACTIVE };
const OWED = { ...ACCOUNT_SHARE, paymentStatus: { in: [$Enums.PaymentStatus.UNPAID, $Enums.PaymentStatus.PART_PAID] } };

export type PatientChargesQuery = { encounterId?: string; unpaid?: boolean; limit: number; offset: number };

/**
 * Every billable event becomes a Charge, whoever ends up paying (PRD 10 §5, D7).
 * Its allocations always sum to its amount (§6.1).
 */
@Injectable()
export class ChargesService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly billingAccounts: BillingAccountsService,
        private readonly ledger: LedgerService,
        private readonly queueHolds: QueueHoldsService,
    ) {}

    /**
     * Posts the charge, bills it, and pays it from any unapplied credit. If the patient still owes
     * for it, they go on the cashier's list (11 §6.1), once per visit, however many charges post.
     * A free item still leaves no billing task.
     * Pass `locked` when posting several charges to an account already locked in this transaction.
     */
    async post(input: PostChargeInput, locked?: BillingAccount) {
        if (input.coverageId) {
            // Coverage allocation (copay, caps, payer share) is PRD 10 step 4
            throw new BadRequestException('Insured charges are not supported yet');
        }

        return this.databaseService.transaction(async () => {
            const client    = this.databaseService.client;
            const accountId = locked?.id ?? input.billingAccountId ?? await this.billingAccounts.currentAccountIdOrThrow(input.patientId);
            const account   = locked ?? await this.ledger.lockAccount(accountId);
            if (account.status !== $Enums.AccountStatus.ACTIVE) {
                throw new ConflictException(`Billing account ${account.accountNumber} is ${account.status.toLowerCase()}`);
            }

            const quantity  = input.quantity ?? 1;
            const unitPrice = toDecimal(input.unitPrice);
            const amount    = unitPrice.times(quantity);

            const charge = await withConstraintErrors(
                () => client.charge.create({
                    data: {
                        patientId:        input.patientId,
                        branchId:         input.branchId,
                        appointmentId:    input.appointmentId,
                        encounterId:      input.encounterId,
                        billingAccountId: accountId,
                        category:         input.category,
                        description:      input.description,
                        quantity,
                        unitPrice,
                        amount,
                        sourceType:       input.sourceType,
                        sourceId:         input.sourceId,
                        createdBy:        input.createdBy,
                    },
                }),
                { notFound: 'Patient or branch not found' },
            );

            // A free item is still recorded, but there is nobody to allocate ₦0 to
            if (amount.lte(0)) return { charge, allocations: [], account, billingTask: null };

            const allocation = await client.chargeAllocation.create({
                data: {
                    chargeId:         charge.id,
                    responsibleType:  $Enums.ResponsibleType.ACCOUNT,
                    billingAccountId: accountId,
                    basis:            $Enums.AllocationBasis.NOT_COVERED,
                    amount,
                    paymentStatus:    $Enums.PaymentStatus.UNPAID,
                    createdBy:        input.createdBy,
                },
            });

            const billed = await this.ledger.postEntry({
                accountId,
                entryType:    $Enums.AccountEntryType.CHARGE,
                amount:       amount.negated(),
                patientId:    input.patientId,
                allocationId: allocation.id,
                description:  input.description,
                branchId:     input.branchId,
                createdBy:    input.createdBy,
            }, account);

            // Prepaid credit pays the new bill immediately (§6.2 step 8)
            const paid = await this.ledger.applyCredit({ accountId, appliedBy: input.createdBy }, billed.account);
            const paidNow = paid.applications
                .filter(a => a.allocationId === allocation.id)
                .reduce((sum, a) => sum.plus(a.amount), toDecimal(0));

            const billingTask = paidNow.lt(amount)
                ? await this.queueHolds.ensureBillingTask({
                    patientId:   input.patientId,
                    encounterId: input.encounterId,
                    branchId:    input.branchId,
                    by:          input.createdBy,
                })
                : null;

            return {
                charge,
                allocations: [{
                    ...allocation,
                    paidAmount:    paidNow,
                    paymentStatus: paidNow.gte(amount) ? $Enums.PaymentStatus.PAID
                                 : paidNow.gt(0)       ? $Enums.PaymentStatus.PART_PAID
                                 :                       $Enums.PaymentStatus.UNPAID,
                }],
                account: paid.account,
                billingTask,
            };
        });
    }

    /**
     * A patient's charges, newest first, each with what their own account owes for it, plus their
     * total outstanding: what a cashier collects. `unpaid` keeps only charges still owed;
     * `encounterId` keeps one visit's.
     */
    async findByPatientId(organizationId: string, patientId: string, query: PatientChargesQuery) {
        const client = this.databaseService.client;
        const where = {
            patientId,
            patient: { hospitalId: organizationId },
            ...(query.encounterId && { encounterId: query.encounterId }),
            ...(query.unpaid && { allocations: { some: OWED } }),
        };

        const [count, docs, owed] = await client.$transaction([
            client.charge.count({ where }),
            client.charge.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, description: true, category: true, quantity: true, unitPrice: true, amount: true,
                    status: true, sourceType: true, createdAt: true, billingAccountId: true,
                    encounter:   { select: { id: true, arrivedAt: true, clinic: { select: { id: true, name: true } } } },
                    allocations: { where: ACCOUNT_SHARE, select: { amount: true, paidAmount: true } },
                },
            }),
            client.chargeAllocation.aggregate({
                where: { ...OWED, charge: where },
                _sum:  { amount: true, paidAmount: true },
            }),
        ]);

        return {
            count,
            outstanding: toDecimal(owed._sum.amount ?? 0).minus(owed._sum.paidAmount ?? 0),
            docs: docs.map(({ allocations, ...charge }) => ({ ...charge, patientShare: patientShare(allocations) })),
        };
    }
}
