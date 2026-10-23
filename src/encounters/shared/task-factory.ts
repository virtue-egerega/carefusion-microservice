import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CASHIER_QUEUE_KEY } from '../queue-holds/queue-holds.rules';
import { QueueHoldsService } from '../queue-holds/queue-holds.service';
import { nextTicket } from './tickets';

/** A queue a task is being created on, with what decides how the task starts. */
export type TargetQueue = { id: string; name: string; isConsultation: boolean; isBilling: boolean };

export type NewTask = {
    encounterId: string;
    patientId: string;
    branchId: string;
    queue: TargetQueue;
    fromEntryId?: string;
    ready?: boolean;          // cleared to be served now: the tasks a funded check-in starts with (11 §6.2)
    by: string;
    now: Date;
};

/**
 * Creates tasks (queue entries) the one way every path needs (11 §5): a ticket, and the status it
 * starts in. The visit was funded at check-in (11 §6.2), so a clinic doctors' task, and the tasks
 * check-in starts with (`ready`), are AWAITING_SERVICE; anything else is WAITING. Billing goes
 * through the cashier's own rule, so a patient is on that list once however they're sent. Call
 * inside a transaction, after the visit's charges are posted.
 */
@Injectable()
export class TaskFactory {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly queueHolds: QueueHoldsService,
    ) {}

    /** The active queues among these ids, with their kind. Missing ids are left out. */
    async loadQueues(ids: string[]): Promise<TargetQueue[]> {
        const queues = await this.databaseService.client.queue.findMany({
            where:  { id: { in: ids }, isActive: true, deletedAt: null },
            select: { id: true, name: true, systemKey: true, doctorsForClinics: { select: { id: true }, take: 1 } },
        });
        return queues.map(q => ({
            id:             q.id,
            name:           q.name,
            isConsultation: q.doctorsForClinics.length > 0,
            isBilling:      q.systemKey === CASHIER_QUEUE_KEY,
        }));
    }

    async create(t: NewTask) {
        if (t.queue.isBilling) {
            return this.queueHolds.ensureBillingTask({ patientId: t.patientId, encounterId: t.encounterId, branchId: t.branchId, by: t.by, now: t.now });
        }

        const ready = t.ready || t.queue.isConsultation;
        const ticketNumber = await nextTicket(this.databaseService, t.queue.id, t.branchId, t.now);
        // a triaged patient keeps the triage priority on every list they're sent to (11 §8.1)
        const encounter = await this.databaseService.client.encounter.findUnique({ where: { id: t.encounterId }, select: { triagePriority: true } });

        const task = await withConstraintErrors(
            () => this.databaseService.client.queueEntry.create({
                data: {
                    encounterId:     t.encounterId,
                    patientId:       t.patientId,
                    queueId:         t.queue.id,
                    branchId:        t.branchId,
                    ticketNumber,
                    status:          ready ? $Enums.QueueEntryStatus.AWAITING_SERVICE : $Enums.QueueEntryStatus.WAITING,
                    ...(encounter?.triagePriority && { priority: encounter.triagePriority, priorityReason: 'Triage' }),
                    fromEntryId:     t.fromEntryId,
                    enteredAt:       t.now,
                    readyAt:         t.now,
                    createdBy:       t.by,
                },
                select: { id: true, ticketNumber: true, status: true, holdReason: true, enteredAt: true },
            }),
            { conflict: `This patient is already on ${t.queue.name}'s list` },
        );
        return { ...task, queue: { id: t.queue.id, name: t.queue.name } };
    }
}
