-- CreateEnum
CREATE TYPE "PublicHealthRole" AS ENUM ('INSPECTOR', 'DATA_ANALYST', 'SUPERVISOR', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "NHISRole" AS ENUM ('ADMIN', 'VERIFIER', 'CLAIMS_PROCESSOR', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentPlan" AS ENUM ('EPIC', 'PREMIUM', 'EXQUISITE');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HOSPITAL', 'LABORATORY', 'PHARMACY');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('STANDALONE', 'CHAIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'NOTAPPROVED', 'RESTRICTED', 'DELETED');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('RESIDENCE', 'WORK', 'ORIGIN');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('SESSION', 'API', 'PASSWORDRESET', 'DELETEACCOUNT', 'VERIFYACCOUNT');

-- CreateEnum
CREATE TYPE "HospitalStaffRole" AS ENUM ('ADMIN', 'SUPERADMIN', 'MANAGER', 'DOCTOR', 'NURSE', 'LAB_ADMIN', 'PHARMACIST', 'RECEPTIONIST', 'ACCOUNTANT', 'LAB_TECHNICIAN', 'PHARMACY_TECHNICIAN', 'RADIOLOGIST', 'PHLEBOTOMIST', 'OPTOMETRIST', 'DENTIST', 'OTHER');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('SUPERADMIN', 'ADMIN', 'HOSPITAL_STAFF', 'PATIENT', 'NHIS_WORKER', 'PUBLIC_HEALTH_WORKER');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "Genotype" AS ENUM ('AA', 'AS', 'SS', 'AC', 'SC', 'CC', 'AE', 'EE');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'STARTED', 'IN_PROGRESS', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ConsultationReason" AS ENUM ('FOLLOW_UP', 'TEST_REVIEW', 'EMERGENCY', 'ROUTINE', 'REFERRAL', 'CHECKUP', 'ANTENATAL', 'POSTNATAL', 'VACCINATION', 'MEDICATION', 'PHYSICAL_EXAMINATION', 'LAB_TEST', 'IMAGING', 'PROCEDURE', 'SURGERY', 'REHABILITATION', 'THERAPY', 'COUNSELING', 'EDUCATION', 'MONITORING', 'SCREENING', 'PREVENTION', 'OTHER');

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

-- CreateEnum
CREATE TYPE "PasswordChangeReason" AS ENUM ('ADMIN_RESET', 'USER_CHANGE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "logo" TEXT,
    "phone" TEXT[],
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "website" TEXT,
    "slogan" TEXT,
    "pobox" TEXT,
    "nfcCardFee" DECIMAL(65,30) NOT NULL DEFAULT 1000.00,
    "registrationFee" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "paymentPlan" "PaymentPlan",
    "businessType" "BusinessType" NOT NULL DEFAULT 'HOSPITAL',
    "orgType" "OrgType" NOT NULL DEFAULT 'STANDALONE',
    "healthcareNetworkId" TEXT,
    "healthcareNetworkName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT[],
    "email" TEXT,
    "isMainBranch" BOOLEAN NOT NULL DEFAULT false,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "phone" TEXT[],
    "type" "UserType" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "refreshToken" TEXT,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "changedBy" TEXT,
    "reason" "PasswordChangeReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAccessToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonalAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "HospitalStaffRole" NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "DutyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProfileQueue" (
    "id" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,

    CONSTRAINT "DutyProfileQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProfilePermission" (
    "id" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "DutyProfilePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalStaff" (
    "user_id" TEXT NOT NULL,
    "departmentId" TEXT,
    "hospitalId" TEXT,
    "role" "HospitalStaffRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "HospitalStaff_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "postalCode" TEXT,
    "type" "AddressType" NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "user_id" TEXT NOT NULL,
    "patientId" SERIAL NOT NULL,
    "nfcId" TEXT NOT NULL,
    "nfcLinkedAt" TIMESTAMP(3),
    "nfcLinkedBy" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "sex" "Gender",
    "maritalStatus" "MaritalStatus",
    "nationality" TEXT,
    "occupation" TEXT,
    "religion" TEXT,
    "ethnicity" TEXT,
    "spokenLanguages" TEXT[],
    "bloodGroup" "BloodGroup",
    "genotype" "Genotype",
    "emergencyContactId" TEXT,
    "hospital_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "NextOfKin" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT[],
    "email" TEXT,
    "address" TEXT,
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NextOfKin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NHISWorker" (
    "user_id" TEXT NOT NULL,
    "role" "NHISRole",
    "payerId" TEXT NOT NULL,

    CONSTRAINT "NHISWorker_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "PublicHealthWorker" (
    "user_id" TEXT NOT NULL,
    "role" "PublicHealthRole",

    CONSTRAINT "PublicHealthWorker_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "ConsultationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "appointmentStartedAt" TIMESTAMP(3),
    "appointmentEndedAt" TIMESTAMP(3),
    "checkin" BOOLEAN DEFAULT false,
    "checkinAt" TIMESTAMP(3),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" "ConsultationReason" NOT NULL,
    "consultationTypeId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "referralNote" TEXT,
    "referredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

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
    "appliedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
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
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "email_lastname_index" ON "User"("email", "lastName");

-- CreateIndex
CREATE INDEX "phone_lastname_index" ON "User"("phone", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_token_key" ON "PersonalAccessToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_user_id_type_key" ON "PersonalAccessToken"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfile_name_key" ON "DutyProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfileQueue_dutyProfileId_queueId_key" ON "DutyProfileQueue"("dutyProfileId", "queueId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfilePermission_dutyProfileId_permissionId_key" ON "DutyProfilePermission"("dutyProfileId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_staffId_dutyProfileId_key" ON "StaffAssignment"("staffId", "dutyProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_systemKey_key" ON "Department"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_systemKey_key" ON "Queue"("systemKey");

-- CreateIndex
CREATE INDEX "Queue_departmentId_idx" ON "Queue"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Address_userId_type_key" ON "Address"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nfcId_key" ON "Patient"("nfcId");

-- CreateIndex
CREATE INDEX "emergency_contact_index" ON "NextOfKin"("patientId", "isEmergencyContact");

-- CreateIndex
CREATE INDEX "patient_contact_index" ON "NextOfKin"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "NextOfKin_patientId_isEmergencyContact_key" ON "NextOfKin"("patientId", "isEmergencyContact");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationType_name_key" ON "ConsultationType"("name");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_hospitalId_idx" ON "Appointment"("hospitalId");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Appointment_checkinAt_idx" ON "Appointment"("checkinAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_idx" ON "Appointment"("doctorId");

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
CREATE INDEX "AccountEntry_branchId_idx" ON "AccountEntry"("branchId");

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
CREATE UNIQUE INDEX "BenefitUsage_scope_scopeId_category_periodStart_key" ON "BenefitUsage"("scope", "scopeId", "category", "periodStart");

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
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordHistory" ADD CONSTRAINT "PasswordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAccessToken" ADD CONSTRAINT "PersonalAccessToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfile" ADD CONSTRAINT "DutyProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfileQueue" ADD CONSTRAINT "DutyProfileQueue_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfileQueue" ADD CONSTRAINT "DutyProfileQueue_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfilePermission" ADD CONSTRAINT "DutyProfilePermission_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfilePermission" ADD CONSTRAINT "DutyProfilePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HospitalStaff"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextOfKin" ADD CONSTRAINT "NextOfKin_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NHISWorker" ADD CONSTRAINT "NHISWorker_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NHISWorker" ADD CONSTRAINT "NHISWorker_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHealthWorker" ADD CONSTRAINT "PublicHealthWorker_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_consultationTypeId_fkey" FOREIGN KEY ("consultationTypeId") REFERENCES "ConsultationType"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

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
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
