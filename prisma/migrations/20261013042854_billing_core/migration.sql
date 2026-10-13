-- CreateEnum
CREATE TYPE "BillingAccountType" AS ENUM ('INDIVIDUAL', 'FAMILY', 'PAYER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountEntryType" AS ENUM ('DEPOSIT', 'REMITTANCE', 'CHARGE', 'WRITE_OFF', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'POS', 'TRANSFER', 'ONLINE', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PayerType" AS ENUM ('HMO', 'GOVERNMENT', 'CORPORATE', 'STAFF');

-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('CLAIMS', 'DIRECT_INVOICE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "OverLimitAction" AS ENUM ('BILL_TO_ACCOUNT', 'REQUIRE_APPROVAL');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('REGISTRATION', 'CONSULTATION', 'LABORATORY', 'RADIOLOGY', 'PHARMACY', 'PROCEDURE', 'THEATRE', 'ADMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "MemberType" AS ENUM ('PRINCIPAL', 'SPOUSE', 'CHILD', 'OTHER_DEPENDANT');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ResponsibleType" AS ENUM ('PAYER', 'ACCOUNT', 'HOSPITAL');

-- CreateEnum
CREATE TYPE "AllocationBasis" AS ENUM ('COVERED', 'COPAY', 'OVER_LIMIT', 'NOT_COVERED', 'REBILLED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "AllocationState" AS ENUM ('ACTIVE', 'SUPERSEDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_AUTH', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PART_PAID', 'PAID', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "UsageScope" AS ENUM ('MEMBER', 'POLICY');

-- CreateEnum
CREATE TYPE "FinancialRequestType" AS ENUM ('WRITE_OFF', 'REFUND', 'ADJUSTMENT', 'CHARGE_VOID', 'TRANSFER', 'CREDIT_LIMIT_CHANGE', 'RECOVERY');

-- CreateEnum
CREATE TYPE "FinancialRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "FinancialReason" AS ENUM ('PAYER_REJECTION_HOSPITAL_FAULT', 'PAYER_TARIFF_DISPUTE', 'MISSING_PREAUTH', 'WAIVER_CLINICAL', 'WAIVER_WELFARE', 'STAFF_BENEFIT', 'BAD_DEBT', 'DECEASED_NO_ESTATE', 'CHARGE_ERROR', 'DUPLICATE_PAYMENT', 'OVERPAYMENT', 'SERVICE_NOT_RENDERED', 'DEBT_RECOVERED', 'OTHER');

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountType" "BillingAccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "holderPatientId" TEXT,
    "holderName" TEXT,
    "holderPhone" TEXT[],
    "payerId" TEXT,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "unappliedCredit" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAccountMember" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "BillingAccountMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "patientId" TEXT,
    "entryType" "AccountEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "allocationId" TEXT,
    "requestId" TEXT,
    "reversesId" TEXT,
    "modeOfPayment" "PaymentMode",
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "AccountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payerType" "PayerType" NOT NULL,
    "settlementMode" "SettlementMode" NOT NULL,
    "contactName" TEXT,
    "phone" TEXT[],
    "email" TEXT,
    "address" TEXT,
    "paymentTermDays" INTEGER,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "copayPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "annualLimitPerMember" DECIMAL(14,2),
    "annualLimitPerPolicy" DECIMAL(14,2),
    "overLimitAction" "OverLimitAction" NOT NULL DEFAULT 'BILL_TO_ACCOUNT',
    "maxSpouses" INTEGER NOT NULL DEFAULT 0,
    "maxChildren" INTEGER NOT NULL DEFAULT 0,
    "childMaxAge" INTEGER,
    "allowOtherDependants" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanBenefit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "covered" BOOLEAN NOT NULL DEFAULT true,
    "copayPercent" DECIMAL(5,2),
    "annualLimit" DECIMAL(14,2),
    "requiresPreAuth" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "principalPatientId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coverage" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "memberType" "MemberType" NOT NULL,
    "memberNumber" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "billingAccountId" TEXT NOT NULL,
    "coverageId" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeAllocation" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "responsibleType" "ResponsibleType" NOT NULL,
    "billingAccountId" TEXT,
    "coverageId" TEXT,
    "basis" "AllocationBasis" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "state" "AllocationState" NOT NULL DEFAULT 'ACTIVE',
    "replacesId" TEXT,
    "requestId" TEXT,
    "reviewStatus" "ReviewStatus",
    "authorizationCode" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ChargeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitUsage" (
    "id" TEXT NOT NULL,
    "scope" "UsageScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "category" "ServiceCategory",
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "usedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BenefitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentApplication" (
    "id" TEXT NOT NULL,
    "creditEntryId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedBy" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,

    CONSTRAINT "PaymentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "requestType" "FinancialRequestType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reasonCode" "FinancialReason" NOT NULL,
    "narrative" TEXT NOT NULL,
    "billingAccountId" TEXT,
    "chargeId" TEXT,
    "payload" JSONB,
    "requiredApprovals" INTEGER NOT NULL,
    "status" "FinancialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "FinancialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRequestTarget" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "FinancialRequestTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRequestApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "note" TEXT NOT NULL,
    "approverLimit" DECIMAL(14,2) NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRequestApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRequestAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileRef" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "description" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalLimit" (
    "id" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "requestType" "FinancialRequestType" NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ApprovalLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestType" "FinancialRequestType" NOT NULL,
    "dualApprovalAbove" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_accountNumber_key" ON "BillingAccount"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_payerId_key" ON "BillingAccount"("payerId");

-- CreateIndex
CREATE INDEX "BillingAccount_organizationId_accountType_status_idx" ON "BillingAccount"("organizationId", "accountType", "status");

-- CreateIndex
CREATE INDEX "BillingAccountMember_patientId_leftAt_idx" ON "BillingAccountMember"("patientId", "leftAt");

-- CreateIndex
CREATE INDEX "BillingAccountMember_accountId_leftAt_idx" ON "BillingAccountMember"("accountId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountEntry_reversesId_key" ON "AccountEntry"("reversesId");

-- CreateIndex
CREATE INDEX "AccountEntry_accountId_createdAt_idx" ON "AccountEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountEntry_patientId_createdAt_idx" ON "AccountEntry"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountEntry_allocationId_idx" ON "AccountEntry"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payer_organizationId_name_key" ON "Payer"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_payerId_name_key" ON "Plan"("payerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlanBenefit_planId_category_key" ON "PlanBenefit"("planId", "category");

-- CreateIndex
CREATE INDEX "Policy_principalPatientId_idx" ON "Policy"("principalPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_planId_policyNumber_key" ON "Policy"("planId", "policyNumber");

-- CreateIndex
CREATE INDEX "Coverage_patientId_status_idx" ON "Coverage"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Coverage_policyId_patientId_key" ON "Coverage"("policyId", "patientId");

-- CreateIndex
CREATE INDEX "Charge_patientId_createdAt_idx" ON "Charge"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Charge_billingAccountId_createdAt_idx" ON "Charge"("billingAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "Charge_sourceType_sourceId_idx" ON "Charge"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Charge_appointmentId_idx" ON "Charge"("appointmentId");

-- CreateIndex
CREATE INDEX "ChargeAllocation_chargeId_state_idx" ON "ChargeAllocation"("chargeId", "state");

-- CreateIndex
CREATE INDEX "ChargeAllocation_billingAccountId_paymentStatus_state_idx" ON "ChargeAllocation"("billingAccountId", "paymentStatus", "state");

-- CreateIndex
CREATE INDEX "ChargeAllocation_coverageId_reviewStatus_idx" ON "ChargeAllocation"("coverageId", "reviewStatus");

-- CreateIndex
-- NULLS NOT DISTINCT: the overall-limit row (category IS NULL) must be unique too (PRD 10 §6.4)
CREATE UNIQUE INDEX "BenefitUsage_scope_scopeId_category_periodStart_key" ON "BenefitUsage"("scope", "scopeId", "category", "periodStart") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "PaymentApplication_allocationId_idx" ON "PaymentApplication"("allocationId");

-- CreateIndex
CREATE INDEX "PaymentApplication_creditEntryId_idx" ON "PaymentApplication"("creditEntryId");

-- CreateIndex
CREATE INDEX "FinancialRequest_organizationId_status_requestType_idx" ON "FinancialRequest"("organizationId", "status", "requestType");

-- CreateIndex
CREATE INDEX "FinancialRequest_requestedBy_idx" ON "FinancialRequest"("requestedBy");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRequestTarget_requestId_allocationId_key" ON "FinancialRequestTarget"("requestId", "allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRequestApproval_requestId_approverId_key" ON "FinancialRequestApproval"("requestId", "approverId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalLimit_dutyProfileId_requestType_key" ON "ApprovalLimit"("dutyProfileId", "requestType");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalPolicy_organizationId_requestType_key" ON "ApprovalPolicy"("organizationId", "requestType");

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_holderPatientId_fkey" FOREIGN KEY ("holderPatientId") REFERENCES "Patient"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccountMember" ADD CONSTRAINT "BillingAccountMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccountMember" ADD CONSTRAINT "BillingAccountMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ChargeAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "AccountEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanBenefit" ADD CONSTRAINT "PlanBenefit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_principalPatientId_fkey" FOREIGN KEY ("principalPatientId") REFERENCES "Patient"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "ChargeAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_creditEntryId_fkey" FOREIGN KEY ("creditEntryId") REFERENCES "AccountEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ChargeAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestTarget" ADD CONSTRAINT "FinancialRequestTarget_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestTarget" ADD CONSTRAINT "FinancialRequestTarget_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ChargeAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestApproval" ADD CONSTRAINT "FinancialRequestApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestAttachment" ADD CONSTRAINT "FinancialRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalLimit" ADD CONSTRAINT "ApprovalLimit_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Integrity rules Prisma can't express (PRD 10). Hand-written — keep when regenerating.
-- ============================================================================

-- §3.2 Every patient has exactly one current billing-account membership
CREATE UNIQUE INDEX "BillingAccountMember_current_patient_key"
    ON "BillingAccountMember"("patientId") WHERE "leftAt" IS NULL;

-- §4.4 Exactly one PRINCIPAL per policy
CREATE UNIQUE INDEX "Coverage_one_principal_per_policy_key"
    ON "Coverage"("policyId") WHERE "memberType" = 'PRINCIPAL';

-- §3.1 A PAYER account belongs to a payer; patient accounts never do
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

-- §4.2 Percentages and caps
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_copay_range_check"
    CHECK ("copayPercent" BETWEEN 0 AND 100);
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_limits_check"
    CHECK ("maxSpouses" >= 0 AND "maxChildren" >= 0
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

-- §8 Requests
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_shape_check"
    CHECK ("amount" >= 0 AND "requiredApprovals" IN (1, 2) AND length(trim("narrative")) >= 20);
ALTER TABLE "FinancialRequestTarget" ADD CONSTRAINT "FinancialRequestTarget_amount_check"
    CHECK ("amount" > 0);
ALTER TABLE "FinancialRequestApproval" ADD CONSTRAINT "FinancialRequestApproval_note_check"
    CHECK (length(trim("note")) > 0);
ALTER TABLE "ApprovalLimit" ADD CONSTRAINT "ApprovalLimit_amount_check"
    CHECK ("maxAmount" >= 0);
