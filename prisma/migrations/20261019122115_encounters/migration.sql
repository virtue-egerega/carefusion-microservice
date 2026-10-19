-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('OUTPATIENT', 'INPATIENT');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('WALK_IN', 'APPOINTMENT', 'REFERRAL_IN', 'SELF_PRESENTED_EMERGENCY', 'AMBULANCE', 'POLICE', 'TRANSFER_IN', 'SERVICE_ONLY', 'BIRTH');

-- CreateEnum
CREATE TYPE "Acuity" AS ENUM ('IMMEDIATE', 'VERY_URGENT', 'URGENT', 'ROUTINE', 'DEAD_ON_ARRIVAL');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('DISCHARGED_HOME', 'TRANSFERRED_OUT', 'REFERRED_OUT', 'LEFT_WITHOUT_BEING_SEEN', 'LEFT_BEFORE_COMPLETION', 'LEFT_AGAINST_ADVICE', 'ABSCONDED', 'DIED', 'BROUGHT_IN_DEAD', 'SERVICE_COMPLETED');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('NEONATE', 'INFANT', 'UNDER_FIVE', 'CHILD', 'ADOLESCENT', 'ADULT', 'OLDER_ADULT');

-- CreateEnum
CREATE TYPE "QueuePriority" AS ENUM ('EMERGENCY', 'URGENT', 'ROUTINE');

-- CreateEnum
CREATE TYPE "QueueEntryStatus" AS ENUM ('WAITING', 'HELD', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HoldReason" AS ENUM ('AWAITING_PAYMENT', 'AWAITING_PREAUTH', 'AWAITING_RESULT');

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "encounterId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "consultationFee" DECIMAL(65,30) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "triageQueueId" TEXT NOT NULL,
    "consultationQueueId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "encounterType" "EncounterType" NOT NULL DEFAULT 'OUTPATIENT',
    "status" "EncounterStatus" NOT NULL DEFAULT 'OPEN',
    "visitType" "VisitType" NOT NULL,
    "departmentId" TEXT NOT NULL,
    "clinicId" TEXT,
    "requestedDoctorId" TEXT,
    "appointmentId" TEXT,
    "parentEncounterId" TEXT,
    "followUpOfId" TEXT,
    "attendingStaffId" TEXT,
    "reasonForVisit" TEXT,
    "ageAtArrivalDays" INTEGER,
    "ageGroup" "AgeGroup",
    "acuity" "Acuity",
    "coverageId" TEXT,
    "referringFacility" TEXT,
    "referringClinician" TEXT,
    "isMedicoLegal" BOOLEAN NOT NULL DEFAULT false,
    "policeReportNumber" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" TIMESTAMP(3),
    "disposition" "Disposition",
    "dispositionAt" TIMESTAMP(3),
    "dispositionBy" TEXT,
    "dispositionNote" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedAtQueueId" TEXT,
    "cancelledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "priority" "QueuePriority" NOT NULL DEFAULT 'ROUTINE',
    "priorityReason" TEXT,
    "status" "QueueEntryStatus" NOT NULL DEFAULT 'WAITING',
    "holdReason" "HoldReason",
    "assignedStaffId" TEXT,
    "roomId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "fromEntryId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "calledBy" TEXT,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "servedBy" TEXT,
    "outcomeNote" TEXT,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "scope" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("scope")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_systemKey_key" ON "Clinic"("systemKey");

-- CreateIndex
CREATE INDEX "Clinic_departmentId_idx" ON "Clinic"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_appointmentId_key" ON "Encounter"("appointmentId");

-- CreateIndex
CREATE INDEX "Encounter_patientId_arrivedAt_idx" ON "Encounter"("patientId", "arrivedAt");

-- CreateIndex
CREATE INDEX "Encounter_branchId_status_encounterType_idx" ON "Encounter"("branchId", "status", "encounterType");

-- CreateIndex
CREATE INDEX "QueueEntry_queueId_branchId_status_priority_readyAt_idx" ON "QueueEntry"("queueId", "branchId", "status", "priority", "readyAt");

-- CreateIndex
CREATE INDEX "QueueEntry_encounterId_status_idx" ON "QueueEntry"("encounterId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_sourceType_sourceId_idx" ON "QueueEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "QueueEntry_assignedStaffId_status_idx" ON "QueueEntry"("assignedStaffId", "status");

-- CreateIndex
CREATE INDEX "Charge_encounterId_idx" ON "Charge"("encounterId");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_triageQueueId_fkey" FOREIGN KEY ("triageQueueId") REFERENCES "Queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_consultationQueueId_fkey" FOREIGN KEY ("consultationQueueId") REFERENCES "Queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_requestedDoctorId_fkey" FOREIGN KEY ("requestedDoctorId") REFERENCES "HospitalStaff"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_parentEncounterId_fkey" FOREIGN KEY ("parentEncounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_followUpOfId_fkey" FOREIGN KEY ("followUpOfId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "Coverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_fromEntryId_fkey" FOREIGN KEY ("fromEntryId") REFERENCES "QueueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
