-- CreateEnum
CREATE TYPE "ConsultationKind" AS ENUM ('INITIAL', 'FOLLOW_UP', 'RESULT_REVIEW', 'REFERRAL', 'EMERGENCY', 'WARD_ROUND', 'ADMISSION_CLERKING', 'PRE_OPERATIVE');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'SIGNED');

-- CreateEnum
CREATE TYPE "MedicationAdherence" AS ENUM ('GOOD', 'PARTIAL', 'POOR', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SmokingStatus" AS ENUM ('NEVER', 'FORMER', 'CURRENT');

-- CreateEnum
CREATE TYPE "AlcoholUse" AS ENUM ('NONE', 'OCCASIONAL', 'REGULAR', 'HEAVY');

-- CreateEnum
CREATE TYPE "BodySystem" AS ENUM ('CONSTITUTIONAL', 'CARDIOVASCULAR', 'RESPIRATORY', 'GASTROINTESTINAL', 'GENITOURINARY', 'NEUROLOGICAL', 'MUSCULOSKELETAL', 'SKIN', 'ENT', 'EYES', 'BREAST', 'ENDOCRINE', 'PSYCHIATRIC', 'OTHER');

-- CreateEnum
CREATE TYPE "GeneralSign" AS ENUM ('PALLOR', 'JAUNDICE', 'CYANOSIS', 'CLUBBING', 'LYMPHADENOPATHY', 'OEDEMA', 'DEHYDRATION');

-- CreateEnum
CREATE TYPE "DiagnosisCodeSystem" AS ENUM ('ICD_10', 'ICD_11');

-- CreateEnum
CREATE TYPE "DiagnosisCertainty" AS ENUM ('PROVISIONAL', 'DIFFERENTIAL', 'CONFIRMED', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "ConsultationOutcome" AS ENUM ('SENT_HOME', 'AWAITING_RESULTS', 'FOLLOW_UP', 'REFERRED_INTERNAL', 'REFERRED_OUT', 'ADMIT', 'LEFT_AGAINST_ADVICE', 'DIED');

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "clinicId" TEXT,
    "doctorId" TEXT NOT NULL,
    "type" "ConsultationKind" NOT NULL DEFAULT 'INITIAL',
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "presentingHistory" TEXT,
    "pastSurgicalHistory" TEXT,
    "currentMedications" TEXT,
    "adherence" "MedicationAdherence",
    "adherenceNote" TEXT,
    "socialHistory" TEXT,
    "smoking" "SmokingStatus",
    "alcohol" "AlcoholUse",
    "familyHistory" TEXT,
    "birthHistory" TEXT,
    "immunisationHistory" TEXT,
    "developmentHistory" TEXT,
    "feedingHistory" TEXT,
    "lastMenstrualPeriod" DATE,
    "gravida" INTEGER,
    "parity" INTEGER,
    "abortions" INTEGER,
    "contraception" TEXT,
    "generalExamNote" TEXT,
    "summary" TEXT,
    "impression" TEXT,
    "advice" TEXT,
    "planNotes" TEXT,
    "followUpOn" DATE,
    "outcome" "ConsultationOutcome",
    "outcomeNote" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationComplaint" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "duration" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ConsultationComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationSystemReview" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "system" "BodySystem" NOT NULL,
    "normal" BOOLEAN NOT NULL DEFAULT false,
    "findings" TEXT,

    CONSTRAINT "ConsultationSystemReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationGeneralSign" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "sign" "GeneralSign" NOT NULL,
    "present" BOOLEAN NOT NULL,
    "grade" INTEGER,
    "note" TEXT,

    CONSTRAINT "ConsultationGeneralSign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationExamination" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "system" "BodySystem" NOT NULL,
    "normal" BOOLEAN NOT NULL DEFAULT false,
    "findings" TEXT,

    CONSTRAINT "ConsultationExamination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "codeSystem" "DiagnosisCodeSystem" NOT NULL DEFAULT 'ICD_10',
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "certainty" "DiagnosisCertainty" NOT NULL,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisCode" (
    "codeSystem" "DiagnosisCodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chapter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DiagnosisCode_pkey" PRIMARY KEY ("codeSystem","code")
);

-- CreateTable
CREATE TABLE "ConsultationAddendum" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_queueEntryId_key" ON "Consultation"("queueEntryId");

-- CreateIndex
CREATE INDEX "Consultation_encounterId_idx" ON "Consultation"("encounterId");

-- CreateIndex
CREATE INDEX "Consultation_patientId_startedAt_idx" ON "Consultation"("patientId", "startedAt");

-- CreateIndex
CREATE INDEX "Consultation_organizationId_doctorId_status_idx" ON "Consultation"("organizationId", "doctorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationComplaint_consultationId_position_key" ON "ConsultationComplaint"("consultationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationSystemReview_consultationId_system_key" ON "ConsultationSystemReview"("consultationId", "system");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationGeneralSign_consultationId_sign_key" ON "ConsultationGeneralSign"("consultationId", "sign");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationExamination_consultationId_system_key" ON "ConsultationExamination"("consultationId", "system");

-- CreateIndex
CREATE INDEX "Diagnosis_patientId_recordedAt_idx" ON "Diagnosis"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "Diagnosis_encounterId_idx" ON "Diagnosis"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "Diagnosis_consultationId_codeSystem_code_key" ON "Diagnosis"("consultationId", "codeSystem", "code");

-- CreateIndex
CREATE INDEX "ConsultationAddendum_consultationId_addedAt_idx" ON "ConsultationAddendum"("consultationId", "addedAt");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationComplaint" ADD CONSTRAINT "ConsultationComplaint_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationSystemReview" ADD CONSTRAINT "ConsultationSystemReview_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationGeneralSign" ADD CONSTRAINT "ConsultationGeneralSign_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationExamination" ADD CONSTRAINT "ConsultationExamination_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_codeSystem_code_fkey" FOREIGN KEY ("codeSystem", "code") REFERENCES "DiagnosisCode"("codeSystem", "code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAddendum" ADD CONSTRAINT "ConsultationAddendum_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
