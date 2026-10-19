/*
  Warnings:

  - You are about to drop the column `requestedDoctorId` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `assignedStaffId` on the `QueueEntry` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ConsultationPayment" AS ENUM ('BEFORE', 'AFTER');

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_requestedDoctorId_fkey";

-- DropIndex
DROP INDEX "QueueEntry_assignedStaffId_status_idx";

-- AlterTable
ALTER TABLE "Encounter" DROP COLUMN "requestedDoctorId";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "consultationPayment" "ConsultationPayment" NOT NULL DEFAULT 'BEFORE',
ADD COLUMN     "maxUnpaidBeforeHold" DECIMAL(65,30) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "QueueEntry" DROP COLUMN "assignedStaffId";

-- CreateTable
CREATE TABLE "DutyProfileSendQueue" (
    "id" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,

    CONSTRAINT "DutyProfileSendQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfileSendQueue_dutyProfileId_queueId_key" ON "DutyProfileSendQueue"("dutyProfileId", "queueId");

-- AddForeignKey
ALTER TABLE "DutyProfileSendQueue" ADD CONSTRAINT "DutyProfileSendQueue_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfileSendQueue" ADD CONSTRAINT "DutyProfileSendQueue_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
