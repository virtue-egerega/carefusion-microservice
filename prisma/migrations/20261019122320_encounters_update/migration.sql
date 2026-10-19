-- Integrity rules Prisma can't express (PRD 11). Partial unique indexes: only open / active rows count.

-- 11 §3.3: one open encounter per patient per branch. Check-in maps a violation to 409 OPEN_ENCOUNTER.
CREATE UNIQUE INDEX "Encounter_one_open_per_patient_branch"
    ON "Encounter" ("patientId", "branchId")
    WHERE "status" = 'OPEN';

-- 11 §5.1: at most one active task per encounter per queue. Sending a patient to a list they're
-- already on is a 409. Several active tasks on different queues are allowed (task lists, not lines).
CREATE UNIQUE INDEX "QueueEntry_one_active_per_encounter_queue"
    ON "QueueEntry" ("encounterId", "queueId")
    WHERE "status" IN ('WAITING', 'HELD', 'CALLED', 'IN_SERVICE');
