import { DatabaseService } from '../../database/database.service';

/**
 * The queue's next ticket today at this branch, in one statement (11 §5.4). The counter row stays
 * locked until the surrounding transaction commits, so two tasks never share a ticket; a failed
 * transaction rolls its ticket back. Days are UTC.
 */
export async function nextTicket(db: DatabaseService, queueId: string, branchId: string, now: Date): Promise<number> {
    const scope = `ticket:${queueId}:${branchId}:${now.toISOString().slice(0, 10)}`;
    const [row] = await db.client.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO "SequenceCounter" ("scope", "lastNumber") VALUES (${scope}, 1)
        ON CONFLICT ("scope") DO UPDATE SET "lastNumber" = "SequenceCounter"."lastNumber" + 1
        RETURNING "lastNumber"`;
    return row.lastNumber;
}
