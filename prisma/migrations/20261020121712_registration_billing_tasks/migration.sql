-- 11 §6.1: a patient is on the cashier's list once for fees outside a visit (registration). Tasks
-- with an encounter are covered by "QueueEntry_one_active_per_encounter_queue".
CREATE UNIQUE INDEX "QueueEntry_one_active_registration_bill"
    ON "QueueEntry" ("patientId", "queueId", "branchId")
    WHERE "encounterId" IS NULL AND "status" IN ('WAITING', 'HELD', 'AWAITING_SERVICE', 'CALLED', 'IN_SERVICE');
