import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { toDecimal } from '../../billing/ledger/ledger.service';
import { holdsConsultation } from '../queue-holds/queue-holds.rules';
import { nextTicket } from './tickets';

/** A billing task: collect what the patient owes for this visit (11 §6). Payment completes it. */
export const ENCOUNTER_BILL = 'ENCOUNTER_BILL';
const BILLING_QUEUE_KEY = 'CASHIER_QUEUE';

/** A queue a task is being created on, with what decides how the task starts. */
export type TargetQueue = { id: string; name: string; isConsultation: boolean; isBilling: boolean };

export type NewTask = {
    encounterId: string;
    patientId: string;
    branchId: string;
    queue: TargetQueue;
    fromEntryId?: string;
    by: string;
    now: Date;
};

/**
 * Creates tasks (queue entries) the one way every path needs (11 §5): a ticket, a payment hold on
 * a clinic doctors' task when the hospital collects first, and billing tasks marked as such. Call
 * inside a transaction, after the visit's charges are posted.
 */
@Injectable()
export class TaskFactory {
    constructor(private readonly databaseService: DatabaseService) {}

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
            isBilling:      q.systemKey === BILLING_QUEUE_KEY,
        }));
    }

    async create(t: NewTask) {
        const held = t.queue.isConsultation && holdsConsultation(await this.holdContext(t.encounterId));
        const ticketNumber = await nextTicket(this.databaseService, t.queue.id, t.branchId, t.now);

        const task = await withConstraintErrors(
            () => this.databaseService.client.queueEntry.create({
                data: {
                    encounterId:     t.encounterId,
                    patientId:       t.patientId,
                    queueId:         t.queue.id,
                    branchId:        t.branchId,
                    ticketNumber,
                    status:          held ? $Enums.QueueEntryStatus.HELD : $Enums.QueueEntryStatus.WAITING,
                    holdReason:      held ? $Enums.HoldReason.AWAITING_PAYMENT : null,
                    sourceType:      t.queue.isBilling ? ENCOUNTER_BILL : null,
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

    /** The visit's unpaid share, the account's position and the hospital's policy, in one query. */
    private async holdContext(encounterId: string) {
        const [row] = await this.databaseService.client.$queryRaw<{
            policy: 'BEFORE' | 'AFTER'; maxUnpaid: unknown; department: string; encounterType: string;
            balance: unknown; creditLimit: unknown; unpaid: unknown;
        }[]>`
            SELECT o."consultationPayment" AS "policy", o."maxUnpaidBeforeHold" AS "maxUnpaid",
                   d."systemKey" AS "department", e."encounterType",
                   b."balance", b."creditLimit",
                   (SELECT COALESCE(SUM(a."amount" - a."paidAmount"), 0)
                      FROM "Charge" c JOIN "ChargeAllocation" a ON a."chargeId" = c."id"
                     WHERE c."encounterId" = e."id" AND a."responsibleType" = 'ACCOUNT' AND a."state" = 'ACTIVE') AS "unpaid"
              FROM "Encounter" e
              JOIN "Organization" o ON o."id" = e."organizationId"
              JOIN "Department" d   ON d."id" = e."departmentId"
              LEFT JOIN "BillingAccountMember" m ON m."patientId" = e."patientId" AND m."leftAt" IS NULL
              LEFT JOIN "BillingAccount" b       ON b."id" = m."accountId"
             WHERE e."id" = ${encounterId}`;

        return {
            policy:              row.policy,
            emergency:           row.department === 'EMERGENCY',
            inpatient:           row.encounterType === 'INPATIENT',
            encounterUnpaid:     toDecimal(String(row.unpaid ?? 0)),
            accountDebt:         toDecimal(String(row.balance ?? 0)).negated(),
            creditLimit:         toDecimal(String(row.creditLimit ?? 0)),
            maxUnpaidBeforeHold: toDecimal(String(row.maxUnpaid ?? 0)),
        };
    }
}
