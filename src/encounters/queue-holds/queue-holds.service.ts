import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { ACTIVE_TASK } from '../tasks/tasks.rules';

/**
 * Acts on the queues when money arrives (11 §6). Kept apart from the rest of the encounters
 * module so Billing can call it after a deposit without depending on that module.
 */
@Injectable()
export class QueueHoldsService {
    constructor(private readonly databaseService: DatabaseService) {}

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
     * Billing tasks of fully paid visits are done. Their encounters are locked first, as when a
     * station completes a task, so a station finishing at the same moment can't leave the visit open.
     */
    private async completePaidBills(accountId: string, by: string): Promise<number> {
        const client = this.databaseService.client;
        const bills = await client.$queryRaw<{ encounterId: string; taskId: string; queueId: string }[]>`
            WITH owed AS (
                SELECT c."encounterId", SUM(a."amount" - a."paidAmount") AS "unpaid"
                  FROM "ChargeAllocation" a JOIN "Charge" c ON c."id" = a."chargeId"
                 WHERE a."billingAccountId" = ${accountId} AND a."responsibleType" = 'ACCOUNT' AND a."state" = 'ACTIVE'
                   AND c."encounterId" IS NOT NULL
                 GROUP BY c."encounterId"
            )
            SELECT e."id" AS "encounterId", q."id" AS "taskId", q."queueId"
              FROM owed o
              JOIN "Encounter" e  ON e."id" = o."encounterId"
              JOIN "QueueEntry" q ON q."encounterId" = e."id"
             WHERE o."unpaid" <= 0 AND e."status" = 'OPEN'
               AND q."sourceType" = 'ENCOUNTER_BILL' AND q."status" IN ('WAITING', 'HELD', 'CALLED', 'IN_SERVICE')
               FOR UPDATE OF e`;
        if (!bills.length) return 0;

        const now = new Date();
        await client.queueEntry.updateMany({
            where: { id: { in: bills.map(b => b.taskId) } },
            data:  { status: $Enums.QueueEntryStatus.COMPLETED, completedAt: now, servedBy: by, outcomeNote: 'Paid' },
        });

        // A paid bill with nothing else to do ends the visit at billing (11 §14.1)
        for (const bill of bills) {
            const otherActive = await client.queueEntry.count({
                where: { encounterId: bill.encounterId, status: { in: [...ACTIVE_TASK] } },
            });
            if (otherActive) continue;
            await client.encounter.update({
                where: { id: bill.encounterId },
                data:  { status: $Enums.EncounterStatus.CLOSED, closedAt: now, closedBy: by, closedAtQueueId: bill.queueId },
            });
        }
        return bills.length;
    }
}
