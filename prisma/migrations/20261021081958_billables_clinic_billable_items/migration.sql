/*
  Warnings:

  - You are about to drop the `ClinicConsultationItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClinicConsultationItem" DROP CONSTRAINT "ClinicConsultationItem_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicConsultationItem" DROP CONSTRAINT "ClinicConsultationItem_itemId_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicConsultationItem" DROP CONSTRAINT "ClinicConsultationItem_organizationId_fkey";

-- DropTable
DROP TABLE "ClinicConsultationItem";

-- CreateTable
CREATE TABLE "ClinicBillableItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ClinicBillableItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicBillableItem_organizationId_itemId_idx" ON "ClinicBillableItem"("organizationId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicBillableItem_organizationId_clinicId_itemId_key" ON "ClinicBillableItem"("organizationId", "clinicId", "itemId");

-- AddForeignKey
ALTER TABLE "ClinicBillableItem" ADD CONSTRAINT "ClinicBillableItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicBillableItem" ADD CONSTRAINT "ClinicBillableItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicBillableItem" ADD CONSTRAINT "ClinicBillableItem_itemId_organizationId_fkey" FOREIGN KEY ("itemId", "organizationId") REFERENCES "BillableItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
