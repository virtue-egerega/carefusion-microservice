-- 11 §5.1: at most one active task per encounter per queue, now counting AWAITING_SERVICE as active.
-- Separate from the migration that adds the value: Postgres won't use a new enum value in the
-- transaction that added it.
DROP INDEX "QueueEntry_one_active_per_encounter_queue";
CREATE UNIQUE INDEX "QueueEntry_one_active_per_encounter_queue"
    ON "QueueEntry" ("encounterId", "queueId")
    WHERE "status" IN ('WAITING', 'HELD', 'AWAITING_SERVICE', 'CALLED', 'IN_SERVICE');
