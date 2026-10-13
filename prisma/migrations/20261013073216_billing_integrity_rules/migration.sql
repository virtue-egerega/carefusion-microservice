-- This is an empty migration.
--
-- Integrity rules Prisma's schema language can't express (PRD 10). Created empty by
-- `prisma migrate dev --create-only`; the statements below are hand-written. CHECK constraints
-- and the sequence are invisible to Prisma; the partial unique indexes and NULLS NOT DISTINCT
-- must be kept if a later migration tries to drop or recreate them.

-- ============================================================================
-- Indexes
-- ============================================================================

-- §6.4 Cap counters: the overall-limit row (category IS NULL) must be unique too.
-- Replaces the plain unique index generated from @@unique([scope, scopeId, category, periodStart]).
DROP INDEX "BenefitUsage_scope_scopeId_category_periodStart_key";
CREATE UNIQUE INDEX "BenefitUsage_scope_scopeId_category_periodStart_key"
    ON "BenefitUsage"("scope", "scopeId", "category", "periodStart") NULLS NOT DISTINCT;

-- §3.2 Every patient has exactly one current billing-account membership
CREATE UNIQUE INDEX "BillingAccountMember_current_patient_key"
    ON "BillingAccountMember"("patientId") WHERE "leftAt" IS NULL;

-- §4.4 Exactly one PRINCIPAL per policy
CREATE UNIQUE INDEX "Coverage_one_principal_per_policy_key"
    ON "Coverage"("policyId") WHERE "memberType" = 'PRINCIPAL';

-- ============================================================================
-- Sequence
-- ============================================================================

-- §3.1 Human-readable account numbers (BA-000001), used by BillingAccountsService.nextAccountNumber()
CREATE SEQUENCE "billing_account_number_seq" START 1;

-- ============================================================================
-- CHECK constraints
-- ============================================================================

-- §3.1 Accounts
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_payer_iff_payer_type_check"
    CHECK (("accountType" = 'PAYER') = ("payerId" IS NOT NULL));
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_credit_limit_check"
    CHECK ("creditLimit" >= 0 AND "unappliedCredit" >= 0);

-- §3.3 / D11–D12 Money leaving the charge-and-pay flow must carry an approved request
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_controlled_entry_requires_request_check"
    CHECK ("entryType" NOT IN ('WRITE_OFF', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT')
           OR "requestId" IS NOT NULL);
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_sign_check"
    CHECK (CASE "entryType"
             WHEN 'DEPOSIT'      THEN "amount" > 0
             WHEN 'REMITTANCE'   THEN "amount" > 0
             WHEN 'WRITE_OFF'    THEN "amount" > 0
             WHEN 'TRANSFER_IN'  THEN "amount" > 0
             WHEN 'CHARGE'       THEN "amount" < 0
             WHEN 'REFUND'       THEN "amount" < 0
             WHEN 'TRANSFER_OUT' THEN "amount" < 0
             ELSE "amount" <> 0
           END);
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_reversal_target_check"
    CHECK (("entryType" = 'REVERSAL') = ("reversesId" IS NOT NULL));
-- §7.1 Only credits are applied, never beyond their own amount
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_applied_amount_check"
    CHECK ("appliedAmount" >= 0 AND ("appliedAmount" = 0 OR "appliedAmount" <= "amount"));

-- §4.2 Plans
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_copay_range_check"
    CHECK ("copayPercent" BETWEEN 0 AND 100);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_limits_check"
    CHECK ("maxSpouses" >= 0 AND "maxChildren" >= 0
           AND ("childMaxAge" IS NULL OR "childMaxAge" >= 0)
           AND ("annualLimitPerMember" IS NULL OR "annualLimitPerMember" >= 0)
           AND ("annualLimitPerPolicy" IS NULL OR "annualLimitPerPolicy" >= 0));
ALTER TABLE "PlanBenefit" ADD CONSTRAINT "PlanBenefit_copay_range_check"
    CHECK ("copayPercent" IS NULL OR "copayPercent" BETWEEN 0 AND 100);
ALTER TABLE "PlanBenefit" ADD CONSTRAINT "PlanBenefit_limit_check"
    CHECK ("annualLimit" IS NULL OR "annualLimit" >= 0);

-- §5 Charges
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_amount_check"
    CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "amount" = "quantity" * "unitPrice");

-- §6.1 Allocation ownership shape
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_owner_shape_check"
    CHECK (CASE "responsibleType"
             WHEN 'PAYER'    THEN "billingAccountId" IS NOT NULL AND "coverageId" IS NOT NULL AND "reviewStatus" IS NOT NULL
             WHEN 'ACCOUNT'  THEN "billingAccountId" IS NOT NULL AND "coverageId" IS NULL AND "reviewStatus" IS NULL
             WHEN 'HOSPITAL' THEN "billingAccountId" IS NULL AND "requestId" IS NOT NULL
                                  AND "paymentStatus" = 'NOT_APPLICABLE'
           END);
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_amounts_check"
    CHECK ("amount" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");

-- §7.1 Applications
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_amount_check"
    CHECK ("amount" > 0);

-- §8 Financial requests
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_shape_check"
    CHECK ("amount" >= 0 AND "requiredApprovals" IN (1, 2) AND length(trim("narrative")) >= 20);
ALTER TABLE "FinancialRequestTarget" ADD CONSTRAINT "FinancialRequestTarget_amount_check"
    CHECK ("amount" > 0);
ALTER TABLE "FinancialRequestApproval" ADD CONSTRAINT "FinancialRequestApproval_note_check"
    CHECK (length(trim("note")) > 0);
ALTER TABLE "ApprovalLimit" ADD CONSTRAINT "ApprovalLimit_amount_check"
    CHECK ("maxAmount" >= 0);
