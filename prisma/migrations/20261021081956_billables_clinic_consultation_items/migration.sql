/*
  Warnings:

  - You are about to drop the column `systemKey` on the `BillableItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id,organizationId]` on the table `BillableItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BillableItem_organizationId_systemKey_key";

-- AlterTable
ALTER TABLE "BillableItem" DROP COLUMN "systemKey";

-- CreateTable
CREATE TABLE "ClinicConsultationItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ClinicConsultationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicConsultationItem_itemId_idx" ON "ClinicConsultationItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicConsultationItem_organizationId_clinicId_key" ON "ClinicConsultationItem"("organizationId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "BillableItem_id_organizationId_key" ON "BillableItem"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "ClinicConsultationItem" ADD CONSTRAINT "ClinicConsultationItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicConsultationItem" ADD CONSTRAINT "ClinicConsultationItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicConsultationItem" ADD CONSTRAINT "ClinicConsultationItem_itemId_organizationId_fkey" FOREIGN KEY ("itemId", "organizationId") REFERENCES "BillableItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
