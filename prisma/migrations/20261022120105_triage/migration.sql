-- CreateEnum
CREATE TYPE "Avpu" AS ENUM ('ALERT', 'VOICE', 'PAIN', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "DangerSign" AS ENUM ('UNABLE_TO_DRINK', 'PERSISTENT_VOMITING', 'CONVULSIONS', 'LETHARGY', 'SEVERE_DEHYDRATION', 'DIFFICULTY_BREATHING');

-- CreateEnum
CREATE TYPE "VitalsContext" AS ENUM ('TRIAGE', 'OBSERVATION', 'WARD_ROUND', 'PRE_OP', 'POST_OP');

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "triagePriority" "QueuePriority";

-- CreateTable
CREATE TABLE "TriageAssessment" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "presentingComplaint" TEXT NOT NULL,
    "onset" TEXT,
    "painLocation" TEXT,
    "avpu" "Avpu" NOT NULL,
    "dangerSigns" "DangerSign"[],
    "priority" "QueuePriority" NOT NULL,
    "suggestedPriority" "QueuePriority",
    "replacesId" TEXT,
    "changeReason" TEXT,
    "triagedBy" TEXT NOT NULL,
    "triagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vitals" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "context" "VitalsContext" NOT NULL DEFAULT 'TRIAGE',
    "takenAt" TIMESTAMP(3) NOT NULL,
    "temperature" DECIMAL(3,1),
    "pulse" INTEGER,
    "respiratoryRate" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "spo2" INTEGER,
    "painScore" INTEGER,
    "bloodGlucose" DECIMAL(3,1),
    "weight" DECIMAL(5,2),
    "height" DECIMAL(4,1),
    "notes" TEXT,
    "replacesId" TEXT,
    "editReason" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "removeReason" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vitals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriageAssessment_replacesId_key" ON "TriageAssessment"("replacesId");

-- CreateIndex
CREATE INDEX "TriageAssessment_encounterId_triagedAt_idx" ON "TriageAssessment"("encounterId", "triagedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vitals_replacesId_key" ON "Vitals"("replacesId");

-- CreateIndex
CREATE INDEX "Vitals_encounterId_takenAt_idx" ON "Vitals"("encounterId", "takenAt");

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "TriageAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Vitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
