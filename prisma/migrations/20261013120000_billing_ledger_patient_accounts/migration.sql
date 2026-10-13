-- PRD 10 step 2: money moves off the patient record onto BillingAccount.
-- Hand-written. DESTRUCTIVE: drops User.balance, the Transaction table, Patient.billingtype and
-- Patient.insuranceSchemeId. Existing balances/transactions are NOT carried over.

-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_insuranceSchemeId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_id_fkey";

-- DropIndex
DROP INDEX "patient_balance_index";

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "billingtype",
DROP COLUMN "insuranceSchemeId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "balance";

-- AlterTable
ALTER TABLE "AccountEntry" ADD COLUMN "appliedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "Transaction";

-- DropEnum
DROP TYPE "BillingType";
DROP TYPE "TransactionMode";
DROP TYPE "TransactionStatus";
DROP TYPE "TransactionType";

-- ============================================================================
-- Hand-written (PRD 10). Keep when regenerating.
-- ============================================================================

-- §7.1 Only credits are applied, never beyond their own amount
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_applied_amount_check"
    CHECK ("appliedAmount" >= 0 AND ("appliedAmount" = 0 OR "appliedAmount" <= "amount"));

-- §3.1 Human-readable account numbers: BA-000001
CREATE SEQUENCE "billing_account_number_seq" START 1;

-- §3.2 Backfill: every existing patient gets an INDIVIDUAL account + current membership
INSERT INTO "BillingAccount"
    ("id", "organizationId", "accountNumber", "accountType", "name", "holderPatientId", "holderPhone",
     "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       p."hospital_id",
       'BA-' || lpad(nextval('billing_account_number_seq')::text, 6, '0'),
       'INDIVIDUAL',
       u."firstName" || ' ' || u."lastName",
       p."user_id",
       u."phone",
       'ACTIVE',
       now(),
       now()
FROM "Patient" p
JOIN "User" u ON u."id" = p."user_id"
WHERE NOT EXISTS (
    SELECT 1 FROM "BillingAccountMember" m WHERE m."patientId" = p."user_id" AND m."leftAt" IS NULL
);

INSERT INTO "BillingAccountMember" ("id", "accountId", "patientId", "joinedAt", "createdBy")
SELECT gen_random_uuid()::text, a."id", a."holderPatientId", now(), 'migration'
FROM "BillingAccount" a
WHERE a."accountType" = 'INDIVIDUAL'
  AND a."holderPatientId" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "BillingAccountMember" m WHERE m."patientId" = a."holderPatientId" AND m."leftAt" IS NULL
  );
