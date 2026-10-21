import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { isUniqueViolation } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { StartEncounterDto } from '@shared/contracts/encounters';
import type { AuthUser } from '../../auth/permissions.guard';
import { ChargesService } from '../../billing/charges/charges.service';
import { PricingService } from '../../billables/pricing/pricing.service';
import type { ChargePrice } from '../../billables/pricing/pricing.rules';
import { AGE_SETTINGS_SELECT, ageSnapshot } from '../../patients/age-group';
import { TargetQueue, TaskFactory } from '../shared/task-factory';
import { nextEncounterCode } from '../shared/encounter-codes';
import { visitCoverage } from '../../shared/contracts/encounters/visit-coverage';
import { ACTIVE_TASK } from '../tasks/tasks.rules';
import { firstTaskTargets, consultationFeeApplies, unsendable } from './start-encounter.rules';

const CONSULTATION_FEE = 'CONSULTATION_FEE';

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
        private readonly pricing: PricingService,
        private readonly tasks: TaskFactory,
    ) {}

    /**
     * Starts the patient's encounter at reception (11 §3.3). The patient says what kind of doctor
     * they're seeing; the encounter opens at that clinic (never with a particular doctor: who sees
     * them is settled at the doctors' list), the consultation fee posts, and the patient is put on
     * the lists reception chose: billing, the clinic's nursing station, or both (default: the
     * nursing station). Neither is ever held: payment holds only the doctor's task (11 §6).
     *
     * A patient with an unfinished encounter at this branch gets 409 OPEN_ENCOUNTER; reception
     * either continues it (`continueEncounter`) or has its tasks cancelled first (follow-up).
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
                    hospital: { select: AGE_SETTINGS_SELECT },
                    coverages: visitCoverage(now, dto.coverageId),
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

        if (dto.continueEncounter) return this.continueOpen(visit, at, user.sub, now);

        try {
            return await this.databaseService.transaction(async () => {
                const age = ageSnapshot(patient.dateOfBirth, now, patient.hospital);
                const encounter = await this.databaseService.client.encounter.create({
                    data: {
                        organizationId:    at.organizationId,
                        // taken in this transaction, so a failed check-in rolls it back (11 §4.0)
                        ...await nextEncounterCode(this.databaseService, at.organizationId, now),
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

                const fee = consultationFeeApplies({ coverageId: visit.coverageId, continuingSameClinic: false }) ? visit.price : null;
                const sent = await this.feeAndTasks(encounter.id, visit, fee, at, user.sub, now);
                return { ...encounter, clinic: { id: clinic.id, name: clinic.name }, continued: false, ...sent };
            });
        } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            // The one-open-encounter-per-branch index (11 §3.3)
            const open = await client.encounter.findFirst({
                where:  { patientId: dto.patientId, branchId: at.branchId, status: $Enums.EncounterStatus.OPEN },
                select: { arrivedAt: true, clinic: { select: { name: true } } },
            });
            throw new ConflictException({
                code: 'OPEN_ENCOUNTER',
                message: open
                    ? `This patient has an unfinished visit (${open.clinic?.name ?? 'Emergency'}, since ${open.arrivedAt.toISOString()}). Continue it, or follow it up and close it first.`
                    : 'This patient has an unfinished visit at this branch',
            });
        }
    }

    /**
     * Reception continues the patient's unfinished encounter: the clinic they came for now becomes
     * the encounter's clinic, and the chosen lists get tasks. Returning to the same clinic isn't
     * charged again.
     */
    private continueOpen(visit: Visit, at: At, by: string, now: Date) {
        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            const open = await client.encounter.findFirst({
                where:  { patientId: visit.patientId, branchId: at.branchId, status: $Enums.EncounterStatus.OPEN },
                select: { id: true, clinicId: true, coverageId: true },
            });
            if (!open) throw new NotFoundException('This patient has no unfinished visit to continue');

            const encounter = await client.encounter.update({
                where: { id: open.id },
                data:  {
                    clinicId:          visit.clinic.id,
                    departmentId:      visit.clinic.departmentId,
                },
            });

            // The encounter's own coverage still applies to the visit it already is
            const fee = consultationFeeApplies({ coverageId: open.coverageId, continuingSameClinic: open.clinicId === visit.clinic.id })
                ? visit.price
                : null;
            const sent = await this.feeAndTasks(open.id, visit, fee, at, by, now);
            return { ...encounter, clinic: { id: visit.clinic.id, name: visit.clinic.name }, continued: true, ...sent };
        });
    }

    /**
     * Posts the fee (if any), which puts the patient on the cashier's list when they owe it, then
     * on each chosen list. Choosing billing as well doesn't put them on it twice.
     */
    private async feeAndTasks(encounterId: string, visit: Visit, fee: ChargePrice | null, at: At, by: string, now: Date) {
        const { consultationFee, billingTask } = await this.postConsultationFee(fee, encounterId, visit.patientId, at.branchId, by);
        const tasks = billingTask ? [billingTask] : [];
        for (const queue of visit.targets) {
            const task = await this.tasks.create({ encounterId, patientId: visit.patientId, branchId: at.branchId, queue, by, now });
            if (task && !tasks.some(t => t.id === task.id)) tasks.push(task);
        }
        return { tasks, consultationFee };
    }

    /**
     * Posts the consultation charge for the chosen item, with the billing task it put the patient on
     * if owed. A free item is still recorded (13 §3); post() leaves it nothing to collect.
     */
    private async postConsultationFee(price: ChargePrice | null, encounterId: string, patientId: string, branchId: string, createdBy: string) {
        if (!price) return { consultationFee: null, billingTask: null };

        const posted = await this.charges.post({
            patientId,
            branchId,
            encounterId,
            price,
            sourceType:  CONSULTATION_FEE,
            sourceId:    encounterId,
            createdBy,
        });
        const allocation = posted.allocations[0];
        return {
            consultationFee: {
                id:            posted.charge.id,
                amount:        posted.charge.amount,
                paymentStatus: allocation?.paymentStatus,
                outstanding:   allocation ? allocation.amount.minus(allocation.paidAmount) : 0,
            },
            billingTask: posted.billingTask,
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
