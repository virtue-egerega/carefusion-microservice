import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { isUniqueViolation } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import type { BillingAccount } from '../../../generated/prisma/client';
import { StartEncounterDto } from '@shared/contracts/encounters';
import type { AuthUser } from '../../auth/permissions.guard';
import { ChargesService } from '../../billing/charges/charges.service';
import { BillingAccountsService } from '../../billing/accounts/billing-accounts.service';
import { LedgerService } from '../../billing/ledger/ledger.service';
import { PricingService } from '../../billables/pricing/pricing.service';
import type { ChargePrice } from '../../billables/pricing/pricing.rules';
import { AGE_SETTINGS_SELECT, ageSnapshot } from '../../patients/age-group';
import { TargetQueue, TaskFactory } from '../shared/task-factory';
import { nextEncounterCode } from '../shared/encounter-codes';
import { visitCoverage } from '../../shared/contracts/encounters/visit-coverage';
import { ACTIVE_TASK } from '../tasks/tasks.rules';
import { firstTaskTargets, consultationFeeApplies, fundingShortfall, supersededDisposition, unsendable } from './start-encounter.rules';

const CONSULTATION_FEE = 'CONSULTATION_FEE';

// "1,000.00": for messages only
const NAIRA = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type At = { organizationId: string; branchId: string };
type Clinic = { id: string; name: string; departmentId: string };
type Visit = {
    patientId: string;
    clinic: Clinic;
    targets: TargetQueue[];
    coverageId: string | null;
    price: ChargePrice;   // the chosen consultation item, priced before any transaction (13 §4)
};

@Injectable()
export class StartEncounterService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly charges: ChargesService,
        private readonly billingAccounts: BillingAccountsService,
        private readonly ledger: LedgerService,
        private readonly pricing: PricingService,
        private readonly tasks: TaskFactory,
    ) {}

    /**
     * Starts the patient's encounter at reception (11 §3.3). The patient says what kind of doctor
     * they're seeing; the encounter opens at that clinic (never with a particular doctor: who sees
     * them is settled at the doctors' list), and in one transaction:
     * - the patient's open encounter at this branch is closed, its unfinished tasks cancelled
     *   (an admitted patient is refused: 409 PATIENT_ADMITTED);
     * - the consultation fee is charged straight to the account, once the account can take it
     *   under the hospital's consultationPayment policy (11 §6.2; else 409 INSUFFICIENT_FUNDS),
     *   with no billing task;
     * - the patient is put on the lists reception chose (default: the nursing station), as
     *   AWAITING_SERVICE, so the nurse can attend to them at once.
     * A refusal leaves everything as it was, the old encounter included.
     */
    async startEncounter(dto: StartEncounterDto, at: At, user: AuthUser) {
        const client = this.databaseService.client;
        const now = new Date();

        const clinic = await client.clinic.findFirst({
            where:  { id: dto.clinicId, isActive: true },
            select: { id: true, name: true, departmentId: true, triageQueueId: true },
        });
        if (!clinic) throw new NotFoundException('Clinic not found or not active');
        const targetIds = firstTaskTargets(dto.sendTo, clinic.triageQueueId);

        const [patient, sendable, targets, prices] = await Promise.all([
            client.patient.findFirst({
                where:  { id: dto.patientId, hospitalId: at.organizationId },
                select: {
                    dateOfBirth: true,
                    hospital:    { select: { ...AGE_SETTINGS_SELECT, consultationPayment: true, maxUnpaidBeforeHold: true } },
                    coverages:   visitCoverage(now, dto.coverageId),
                },
            }),
            this.sendableAmong(targetIds, user.dutyProfileIds),
            this.tasks.loadQueues(targetIds),
            this.pricing.selfPayPrices(at.organizationId, [dto.billableItemId], now),
        ]);
        if (!patient) throw new NotFoundException('Patient not found');
        if (dto.coverageId && !patient.coverages.length) {
            throw new UnprocessableEntityException("That coverage isn't active for this patient");
        }
        if (unsendable(targetIds, sendable, clinic.triageQueueId).length) {
            throw new ForbiddenException("You can't send patients to one of those queues");
        }
        if (targets.length !== targetIds.length) throw new UnprocessableEntityException('One of those queues is switched off');

        const visit: Visit = {
            patientId:  dto.patientId,
            clinic,
            targets,
            coverageId: dto.selfPay ? null : patient.coverages[0]?.id ?? null,
            price:      prices.get(dto.billableItemId)!,
        };
        // insured visits aren't charged at check-in until payer allocation (13 Phase 2)
        const fee = consultationFeeApplies({ coverageId: visit.coverageId, continuingSameClinic: false }) ? visit.price : null;

        try {
            return await this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                const open = await tx.encounter.findFirst({
                    where:  { patientId: dto.patientId, branchId: at.branchId, status: $Enums.EncounterStatus.OPEN },
                    select: { id: true, encounterType: true, firstSeenAt: true },
                });
                if (open?.encounterType === $Enums.EncounterType.INPATIENT) {
                    throw new ConflictException({ code: 'PATIENT_ADMITTED', message: 'This patient is admitted. Discharge them first.' });
                }

                // locked for the rest of the transaction, so two check-ins can't spend the same credit
                const account = fee?.unitPrice.gt(0) ? await this.lockFundedAccount(dto.patientId, fee, patient.hospital) : undefined;

                // taken in this transaction, so a refused check-in rolls it back (11 §4.0)
                const numbered = await nextEncounterCode(this.databaseService, at.organizationId, now);
                if (open) await this.closeSuperseded(open, numbered.code, user.sub, now);

                const age = ageSnapshot(patient.dateOfBirth, now, patient.hospital);
                const encounter = await tx.encounter.create({
                    data: {
                        organizationId:    at.organizationId,
                        ...numbered,
                        patientId:         dto.patientId,
                        branchId:          at.branchId,
                        departmentId:      clinic.departmentId,
                        clinicId:          clinic.id,
                        visitType:         $Enums.VisitType.WALK_IN,     // referrals are recorded at triage (11 §8)
                        coverageId:        visit.coverageId,
                        ageAtArrivalDays:  age.ageAtArrivalDays,
                        ageGroup:          age.ageGroup as $Enums.AgeGroup | null,
                        arrivedAt:         now,
                        createdBy:         user.sub,
                    },
                });

                const sent = await this.feeAndTasks(encounter.id, visit, fee, account, at, user.sub, now);
                return { ...encounter, clinic: { id: clinic.id, name: clinic.name }, ...sent };
            });
        } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            // the one-open-encounter-per-branch index: another check-in for this patient won the race
            throw new ConflictException('This patient was just checked in by someone else. Refresh and try again.');
        }
    }

    /**
     * Locks the patient's account and makes sure it can take the fee under the hospital's policy
     * (11 §6.2): BEFORE, the money must be on the account; AFTER, the debt may grow to
     * maxUnpaidBeforeHold. Otherwise 409 INSUFFICIENT_FUNDS with how much to deposit.
     */
    private async lockFundedAccount(
        patientId: string, fee: ChargePrice,
        policy: { consultationPayment: $Enums.ConsultationPayment; maxUnpaidBeforeHold: Prisma.Decimal },
    ) {
        const account = await this.ledger.lockAccount(await this.billingAccounts.currentAccountIdOrThrow(patientId));
        const shortfall = fundingShortfall({
            policy:              policy.consultationPayment,
            balance:             account.balance,
            fee:                 fee.unitPrice,
            maxUnpaidBeforeHold: policy.maxUnpaidBeforeHold,
        });
        if (shortfall) {
            throw new ConflictException({
                code:    'INSUFFICIENT_FUNDS',
                message: `Deposit at least ₦${NAIRA.format(shortfall.toNumber())} to start this visit`,
            });
        }
        return account;
    }

    /**
     * The patient's previous visit is over once a new encounter starts (11 §3.3): its unfinished
     * tasks are cancelled and it closes, with how the patient left.
     */
    private async closeSuperseded(open: { id: string; firstSeenAt: Date | null }, newCode: string, by: string, now: Date) {
        const client = this.databaseService.client;
        const reason = `Closed: new encounter ${newCode} started`;
        await client.queueEntry.updateMany({
            where: { encounterId: open.id, status: { in: [...ACTIVE_TASK] } },
            data:  { status: $Enums.QueueEntryStatus.CANCELLED, completedAt: now, servedBy: by, outcomeNote: reason },
        });
        await client.encounter.update({
            where: { id: open.id },
            data:  {
                status:          $Enums.EncounterStatus.CLOSED,
                closedAt:        now,
                closedBy:        by,
                disposition:     supersededDisposition(open.firstSeenAt),
                dispositionAt:   now,
                dispositionBy:   by,
                dispositionNote: reason,
            },
        });
    }

    /** Charges the fee (if any) to the account, then puts the patient on each chosen list, ready to be served. */
    private async feeAndTasks(
        encounterId: string, visit: Visit, fee: ChargePrice | null, account: BillingAccount | undefined,
        at: At, by: string, now: Date,
    ) {
        const consultationFee = await this.postConsultationFee(fee, account, encounterId, visit.patientId, at.branchId, by);
        const tasks: NonNullable<Awaited<ReturnType<TaskFactory['create']>>>[] = [];
        for (const queue of visit.targets) {
            const task = await this.tasks.create({ encounterId, patientId: visit.patientId, branchId: at.branchId, queue, ready: true, by, now });
            if (task && !tasks.some(t => t.id === task.id)) tasks.push(task);
        }
        return { tasks, consultationFee };
    }

    /**
     * Charges the consultation for the chosen item straight to the account, with no billing task
     * (11 §6.2). A free item is still recorded (13 §3); post() leaves it nothing to collect.
     */
    private async postConsultationFee(
        price: ChargePrice | null, account: BillingAccount | undefined,
        encounterId: string, patientId: string, branchId: string, createdBy: string,
    ) {
        if (!price) return null;

        const posted = await this.charges.post({
            patientId,
            branchId,
            encounterId,
            price,
            sourceType:    CONSULTATION_FEE,
            sourceId:      encounterId,
            noBillingTask: true,
            createdBy,
        }, account);
        const allocation = posted.allocations[0];
        return {
            id:            posted.charge.id,
            amount:        posted.charge.amount,
            paymentStatus: allocation?.paymentStatus,
            outstanding:   allocation ? allocation.amount.minus(allocation.paidAmount) : 0,
        };
    }

    /** Which of these queues the caller's duty profiles may send patients to. */
    private async sendableAmong(queueIds: string[], dutyProfileIds: string[]): Promise<Set<string>> {
        const rows = await this.databaseService.client.dutyProfileSendQueue.findMany({
            where:  { dutyProfileId: { in: dutyProfileIds }, queueId: { in: queueIds } },
            select: { queueId: true },
        });
        return new Set(rows.map(r => r.queueId));
    }

    /** The patient's unfinished encounter at this branch, with what's still to be done, or null. */
    findOpen(patientId: string, at: At) {
        return this.databaseService.client.encounter.findFirst({
            where:  { patientId, organizationId: at.organizationId, branchId: at.branchId, status: $Enums.EncounterStatus.OPEN },
            select: {
                id: true, code: true, arrivedAt: true, firstSeenAt: true, reasonForVisit: true, encounterType: true,
                clinic: { select: { id: true, name: true } },
                queueEntries: {
                    where:   { status: { in: [...ACTIVE_TASK] } },
                    orderBy: { enteredAt: 'asc' },
                    select:  { id: true, status: true, holdReason: true, ticketNumber: true, enteredAt: true, queue: { select: { id: true, name: true } } },
                },
            },
        });
    }
}
