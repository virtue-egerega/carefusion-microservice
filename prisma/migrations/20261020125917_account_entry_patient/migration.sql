-- PRD 10 §3.3: debits account to a patient. Every CHARGE names the patient whose care it was;
-- credits belong to the account and need not. Other debits (refunds, transfers out) are edge cases
-- to be added.
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_charge_requires_patient_check"
    CHECK ("entryType" <> 'CHARGE' OR "patientId" IS NOT NULL);
