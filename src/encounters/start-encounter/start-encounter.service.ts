import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { isUniqueViolation } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { StartEncounterDto } from '@shared/contracts/encounters';
import type { AuthUser } from '../../auth/permissions.guard';
import { ChargesService } from '../../billing/charges/charges.service';
import { AGE_SETTINGS_SELECT, ageSnapshot } from '../../patients/age-group';
import { TargetQueue, TaskFactory } from '../shared/task-factory';
import { visitCoverage } from '../shared/visit-coverage';
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
    fee: Prisma.Decimal;
};

@Injectable()
export class StartEncounterService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly charges: ChargesService,
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

        const [patient, sendable, targets] = await Promise.all([
            client.patient.findFirst({
                where:  { id: dto.patientId, hospitalId: at.organizationId },
                select: {
                    dateOfBirth: true,
                    hospital: { select: { ...AGE_SETTINGS_SELECT, consultationFee: true } },
                    coverages: visitCoverage(now, dto.coverageId),
                },
            }),
            this.sendableAmong(targetIds, user.dutyProfileIds),
            this.tasks.loadQueues(targetIds),
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
            fee:        patient.hospital.consultationFee,
        };

        if (dto.continueEncounter) return this.continueOpen(visit, at, user.sub, now);

        try {
            return await this.databaseService.transaction(async () => {
                const age = ageSnapshot(patient.dateOfBirth, now, patient.hospital);
                const encounter = await this.databaseService.client.encounter.create({
                    data: {
                        organizationId:    at.organizationId,
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

                const fee = consultationFeeApplies({ coverageId: visit.coverageId, continuingSameClinic: false }) ? visit.fee : null;
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
                ? visit.fee
                : null;
            const sent = await this.feeAndTasks(open.id, visit, fee, at, by, now);
            return { ...encounter, clinic: { id: visit.clinic.id, name: visit.clinic.name }, continued: true, ...sent };
        });
    }

    /** Posts the fee (if any), then puts the patient on each chosen list. */
    private async feeAndTasks(encounterId: string, visit: Visit, fee: Prisma.Decimal | null, at: At, by: string, now: Date) {
        const consultationFee = await this.postConsultationFee(fee, encounterId, visit.patientId, at.branchId, by);
        const tasks = [];
        for (const queue of visit.targets) {
            tasks.push(await this.tasks.create({ encounterId, patientId: visit.patientId, branchId: at.branchId, queue, by, now }));
        }
        return { tasks, consultationFee };
    }

    /** Posts the consultation fee; what the patient owes for it shows at billing. A free visit isn't charged. */
    private async postConsultationFee(fee: Prisma.Decimal | null, encounterId: string, patientId: string, branchId: string, createdBy: string) {
        if (!fee || !fee.gt(0)) return null;

        const posted = await this.charges.post({
            patientId,
            branchId,
            encounterId,
            category:    $Enums.ServiceCategory.CONSULTATION,
            description: 'Consultation fee',
            unitPrice:   fee.toString(),
            sourceType:  CONSULTATION_FEE,
            sourceId:    encounterId,
            createdBy,
        });
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
                id: true, arrivedAt: true, firstSeenAt: true, reasonForVisit: true, encounterType: true,
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
