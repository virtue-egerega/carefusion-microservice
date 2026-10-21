import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import type { BillingAccount } from '../../../generated/prisma/client';
import { BillingAccountsService } from '../accounts/billing-accounts.service';
import { LedgerService, toDecimal } from '../ledger/ledger.service';
import { QueueHoldsService } from '../../encounters/queue-holds/queue-holds.service';
import { chargeShare } from './charges.rules';
import type { ChargePrice } from '../../billables/pricing/pricing.rules';
import { lineAmount } from '../../billables/pricing/pricing.rules';

export type PostChargeInput = {
    patientId: string;
    branchId: string;
    price: ChargePrice;                    // from PricingService, resolved before the caller's transaction (13 §3)
    quantity?: number | string;            // Decimal(12, 3); default 1
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

            const { price } = input;
            const quantity  = toDecimal(input.quantity ?? 1);
            const unitPrice = price.unitPrice;
            const amount    = lineAmount(unitPrice, quantity);   // rounded once (13 D8), as quoted (12 §9.3)

            const charge = await withConstraintErrors(
                () => client.charge.create({
                    data: {
                        patientId:        input.patientId,
                        branchId:         input.branchId,
                        appointmentId:    input.appointmentId,
                        encounterId:      input.encounterId,
                        billingAccountId: accountId,
                        category:         price.category as $Enums.ServiceCategory,
                        description:      price.description,
                        quantity,
                        unitPrice,
                        amount,
                        billableItemId:   price.billableItemId,
                        pricingBasis:     price.basis as $Enums.PriceBasis,
                        priceSource:      price.source as $Enums.PriceSource,
                        itemPriceId:      price.itemPriceId,
                        itemCostId:       price.itemCostId,
                        agreementId:      price.agreementId,
                        payerDiscountId:  price.payerDiscountId,
                        pricePercent:     price.percent,
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
                description:  price.description,
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
     * Every charge the patient incurred, newest first, whoever pays: each with its shares and who owes
     * each one (the patient's account, a payer, or the hospital). A charge can have several. Paying
     * is a separate view (findPayableByPatientId). `encounterId` keeps one visit's.
     */
    async findAllIncurredByPatientId(organizationId: string, patientId: string, query: Omit<PatientChargesQuery, 'unpaid'>) {
        const client = this.databaseService.client;
        const where = {
            patientId,
            patient: { hospitalId: organizationId },
            ...(query.encounterId && { encounterId: query.encounterId }),
        };

        const [count, docs] = await client.$transaction([
            client.charge.count({ where }),
            client.charge.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, description: true, category: true, quantity: true, unitPrice: true, amount: true,
                    status: true, sourceType: true, createdAt: true,
                    billableItem: { select: { id: true, code: true, name: true } },
                    encounter:    { select: { id: true, code: true, arrivedAt: true, clinic: { select: { id: true, name: true } } } },
                    allocations:  {
                        where:   { state: $Enums.AllocationState.ACTIVE },
                        orderBy: { createdAt: 'asc' },
                        select:  {
                            id: true, responsibleType: true, basis: true, amount: true, paidAmount: true,
                            paymentStatus: true, reviewStatus: true,
                            billingAccount: { select: { id: true, accountNumber: true, name: true, holderName: true } },
                            coverage:       {
                                select: {
                                    memberNumber: true,
                                    policy: { select: { plan: { select: { id: true, name: true, payer: { select: { id: true, name: true } } } } } },
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        return {
            count,
            docs: docs.map(({ allocations, ...charge }) => ({ ...charge, shares: allocations.map(chargeShare) })),
        };
    }


    /**
     * What the patient has to pay: their account's shares of their charges (ACCOUNT allocations),
     * newest first, each with the charge it's for, plus their total still owed. Payer shares and
     * write-offs aren't theirs to pay, so they're left out. `unpaid` keeps only shares still owed;
     * `encounterId` keeps one visit's.
     */
    async findPayableByPatientId(organizationId: string, patientId: string, query: PatientChargesQuery) {
        const client = this.databaseService.client;
        const charge = {
            patientId,
            patient: { hospitalId: organizationId },
            ...(query.encounterId && { encounterId: query.encounterId }),
        };
        const where = { ...(query.unpaid ? OWED : ACCOUNT_SHARE), charge };

        const [count, docs, owed] = await client.$transaction([
            client.chargeAllocation.count({ where }),
            client.chargeAllocation.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, basis: true, amount: true, paidAmount: true, paymentStatus: true,
                    charge: {
                        select: {
                            id: true, description: true, category: true, quantity: true, unitPrice: true, amount: true,
                            status: true, sourceType: true, createdAt: true,
                            encounter: { select: { id: true, code: true } },
                            billableItem: { select: { id: true, code: true, name: true } },
                        },
                    },
                },
            }),
            client.chargeAllocation.aggregate({
                where: { ...OWED, charge },
                _sum:  { amount: true, paidAmount: true },
            }),
        ]);

        return {
            count,
            outstanding: toDecimal(owed._sum.amount ?? 0).minus(owed._sum.paidAmount ?? 0),
            docs: docs.map(({ paidAmount, ...share }) => ({
                ...share,
                paid:        paidAmount,
                outstanding: Prisma.Decimal.max(share.amount.minus(paidAmount), 0),
            })),
        };
    }
}
