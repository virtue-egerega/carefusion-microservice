import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { ACTIVE_TASK } from '../tasks/tasks.rules';
import { nextTicket } from '../shared/tickets';
import { CASHIER_QUEUE_KEY, ENCOUNTER_BILL, REGISTRATION_BILL, planBillingTask } from './queue-holds.rules';

export type BillingTaskInput = {
    patientId: string;
    encounterId?: string | null;   // null for fees outside a visit (registration)
    branchId: string;
    by: string;
    now?: Date;
};

/**
 * Keeps the queues in step with money (11 §6): puts patients who owe on the cashier's list, and
 * acts when money arrives. Kept apart from the rest of the encounters module so Billing can call
 * it when a charge posts or a deposit lands, without depending on that module.
 */
@Injectable()
export class QueueHoldsService {
    private cashierQueue?: Promise<{ id: string; name: string } | null>;

    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Makes sure the patient is on the cashier's list at this branch for what they owe
     * (`planBillingTask`): keeps the task they're already on, makes their registration task the
     * visit's, or adds one. Call inside the transaction that posted the charge. Null if the
     * hospital has switched the cashier's queue off.
     */
    async ensureBillingTask(input: BillingTaskInput) {
        const queue = await this.cashier();
        if (!queue) return null;

        const client = this.databaseService.client;
        const encounterId = input.encounterId ?? null;
        const select = { id: true, encounterId: true, ticketNumber: true, status: true, holdReason: true, enteredAt: true } as const;

        const active = await client.queueEntry.findMany({
            where:   { queueId: queue.id, branchId: input.branchId, patientId: input.patientId, status: { in: [...ACTIVE_TASK] } },
            orderBy: { enteredAt: 'asc' },
            select,
        });
        const plan = planBillingTask(active, encounterId);

        let task;
        if (plan.action === 'keep') {
            task = active.find(t => t.id === plan.taskId)!;
        } else if (plan.action === 'adopt') {
            task = await client.queueEntry.update({
                where:  { id: plan.taskId },
                data:   { encounter: { connect: { id: encounterId! } }, sourceType: ENCOUNTER_BILL },
                select,
            });
        } else {
            const now = input.now ?? new Date();
            task = await client.queueEntry.create({
                data: {
                    encounterId,
                    patientId:    input.patientId,
                    queueId:      queue.id,
                    branchId:     input.branchId,
                    ticketNumber: await nextTicket(this.databaseService, queue.id, input.branchId, now),
                    status:       $Enums.QueueEntryStatus.WAITING,
                    sourceType:   encounterId ? ENCOUNTER_BILL : REGISTRATION_BILL,
                    enteredAt:    now,
                    readyAt:      now,
                    createdBy:    input.by,
                },
                select,
            });
        }
        const { encounterId: _, ...rest } = task;
        return { ...rest, queue };
    }

    /** The cashier's queue, looked up once: queues are seeded system-wide and keep their ids. */
    private cashier() {
        this.cashierQueue ??= this.databaseService.client.queue
            .findFirst({ where: { systemKey: CASHIER_QUEUE_KEY, isActive: true, deletedAt: null }, select: { id: true, name: true } })
            .then(queue => {
                if (!queue) this.cashierQueue = undefined;   // look again next time, in case it's switched back on
                return queue;
            });
        return this.cashierQueue;
    }

    /**
     * After a payment into this account: releases the doctors' tasks held for payment, and
     * completes the billing tasks of visits now fully paid, closing a visit if that was its last
     * task. Runs inside the deposit's transaction.
     */
    async settle(accountId: string, by: string) {
        const released = await this.releaseHolds(accountId);
        const billsCompleted = await this.completePaidBills(accountId, by);
        return { released, billsCompleted };
    }

    /**
     * A held task is released once its visit's bill is paid, or the account owes no more than its
     * credit limit plus the hospital's tolerance. `readyAt` resets, so time spent unpaid doesn't
     * count as time waiting.
     */
    private releaseHolds(accountId: string): Promise<number> {
        return this.databaseService.client.$executeRaw`
            WITH owed AS (
                SELECT c."encounterId", SUM(a."amount" - a."paidAmount") AS "unpaid"
                  FROM "ChargeAllocation" a JOIN "Charge" c ON c."id" = a."chargeId"
                 WHERE a."billingAccountId" = ${accountId} AND a."responsibleType" = 'ACCOUNT' AND a."state" = 'ACTIVE'
                   AND c."encounterId" IS NOT NULL
                 GROUP BY c."encounterId"
            )
            UPDATE "QueueEntry" q
               SET "status" = 'WAITING', "holdReason" = NULL, "readyAt" = now()
              FROM owed o, "BillingAccount" b, "Organization" org
             WHERE q."encounterId" = o."encounterId"
               AND q."status" = 'HELD' AND q."holdReason" = 'AWAITING_PAYMENT'
               AND b."id" = ${accountId} AND org."id" = b."organizationId"
               AND (o."unpaid" <= 0 OR -b."balance" <= b."creditLimit" + org."maxUnpaidBeforeHold")`;
    }

    /**
     * Billing tasks with nothing left to collect are done: the patient owes nothing for the task's
     * visit, nor any fee outside a visit (registration), which the cashier collects on the same
     * task. Each visit is locked before its task completes, as when a station completes a task, so
     * a station finishing at the same moment can't leave the visit open.
     */
    private async completePaidBills(accountId: string, by: string): Promise<number> {
        const client = this.databaseService.client;
        const bills = await client.$queryRaw<{ taskId: string; encounterId: string | null; queueId: string }[]>`
            SELECT q."id" AS "taskId", q."encounterId", q."queueId"
              FROM "QueueEntry" q
             WHERE q."sourceType" IN (${ENCOUNTER_BILL}, ${REGISTRATION_BILL})
               AND q."status" IN ('WAITING', 'HELD', 'AWAITING_SERVICE', 'CALLED', 'IN_SERVICE')
               AND q."patientId" IN (SELECT "patientId" FROM "BillingAccountMember" WHERE "accountId" = ${accountId} AND "leftAt" IS NULL)
               AND NOT EXISTS (
                   SELECT 1 FROM "Charge" c JOIN "ChargeAllocation" a ON a."chargeId" = c."id"
                    WHERE c."patientId" = q."patientId"
                      AND (c."encounterId" = q."encounterId" OR c."encounterId" IS NULL)
                      AND a."responsibleType" = 'ACCOUNT' AND a."state" = 'ACTIVE' AND a."paidAmount" < a."amount")`;

        const now = new Date();
        let completed = 0;
        for (const bill of bills) {
            if (bill.encounterId) {
                await client.$queryRaw`SELECT 1 FROM "Encounter" WHERE "id" = ${bill.encounterId} FOR UPDATE`;
            }
            // Only if still active: the cashier may have completed it by hand meanwhile
            const { count } = await client.queueEntry.updateMany({
                where: { id: bill.taskId, status: { in: [...ACTIVE_TASK] } },
                data:  { status: $Enums.QueueEntryStatus.COMPLETED, completedAt: now, servedBy: by, outcomeNote: 'Paid' },
            });
            completed += count;
            if (!count || !bill.encounterId) continue;

            // A paid bill with nothing else to do ends the visit at billing (11 §14.1)
            const otherActive = await client.queueEntry.count({
                where: { encounterId: bill.encounterId, status: { in: [...ACTIVE_TASK] } },
            });
            if (otherActive) continue;
            await client.encounter.updateMany({
                where: { id: bill.encounterId, status: $Enums.EncounterStatus.OPEN },
                data:  { status: $Enums.EncounterStatus.CLOSED, closedAt: now, closedBy: by, closedAtQueueId: bill.queueId },
            });
        }
        return completed;
    }
}
