/*
  Warnings:

  - You are about to drop the column `findings` on the `ConsultationExamination` table. All the data in the column will be lost.
  - You are about to drop the column `normal` on the `ConsultationExamination` table. All the data in the column will be lost.
  - Added the required column `note` to the `ConsultationExamination` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ExamFinding" AS ENUM ('NORMAL', 'ABNORMAL');

-- CreateEnum
CREATE TYPE "DosageForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'SOLUTION', 'INJECTION', 'INFUSION', 'CREAM', 'OINTMENT', 'GEL', 'DROPS', 'INHALER', 'SUPPOSITORY', 'PESSARY', 'POWDER', 'PATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "DrugRoute" AS ENUM ('ORAL', 'IV', 'IM', 'SC', 'TOPICAL', 'INHALATION', 'RECTAL', 'VAGINAL', 'OPHTHALMIC', 'OTIC', 'NASAL', 'SUBLINGUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageCondition" AS ENUM ('ROOM_TEMPERATURE', 'COOL', 'REFRIGERATED', 'FROZEN');

-- CreateEnum
CREATE TYPE "BatchQuality" AS ENUM ('RELEASED', 'ON_HOLD', 'RECALLED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORE', 'DISPENSARY', 'WARD', 'THEATRE', 'CLINIC', 'OTHER');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('AVAILABLE', 'QUARANTINE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('OPENING', 'RECEIPT', 'STATUS_CHANGE', 'ISSUE', 'ISSUE_RETURN');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('DELIVERY', 'OPENING');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ConsultationExamination" DROP COLUMN "findings",
DROP COLUMN "normal",
ADD COLUMN     "note" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "nearExpiryDays" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "Drug" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "genericName" TEXT NOT NULL,
    "strength" TEXT,
    "dosageForm" "DosageForm" NOT NULL,
    "route" "DrugRoute" NOT NULL,
    "prescriptionOnly" BOOLEAN NOT NULL DEFAULT true,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "itemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "drugId" TEXT,
    "brandName" TEXT,
    "manufacturerId" TEXT,
    "registrationNo" TEXT,
    "batchTracked" BOOLEAN NOT NULL DEFAULT true,
    "quarantineOnReceipt" BOOLEAN NOT NULL DEFAULT false,
    "storageCondition" "StorageCondition" NOT NULL DEFAULT 'ROOM_TEMPERATURE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "ItemPack" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitsPerPack" INTEGER NOT NULL,
    "barcode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ItemPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT[],
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "manufacturedOn" DATE,
    "expiryDate" DATE,
    "qualityStatus" "BatchQuality" NOT NULL DEFAULT 'RELEASED',
    "qualityReason" TEXT,
    "qualityChangedAt" TIMESTAMP(3),
    "qualityChangedBy" TEXT,
    "recallReference" TEXT,
    "firstReceivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "storageCondition" "StorageCondition" NOT NULL DEFAULT 'ROOM_TEMPERATURE',
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "StockStatus" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "StockTransactionType" NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "StockStatus" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ReceiptType" NOT NULL DEFAULT 'DELIVERY',
    "locationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierInvoiceNo" TEXT,
    "supplierInvoiceDate" DATE,
    "deliveryNote" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "packId" TEXT,
    "packName" TEXT NOT NULL,
    "unitsPerPack" INTEGER NOT NULL,
    "packsDelivered" INTEGER NOT NULL,
    "packsAccepted" INTEGER NOT NULL,
    "rejectReason" TEXT,
    "packCost" DECIMAL(14,2) NOT NULL,
    "batchNumber" TEXT,
    "manufacturedOn" DATE,
    "expiryDate" DATE,
    "locationId" TEXT,
    "receiveAs" "StockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "updateCost" BOOLEAN NOT NULL DEFAULT true,
    "keepCostReason" TEXT,
    "batchId" TEXT,
    "itemCostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationExamFinding" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "finding" "ExamFinding" NOT NULL,
    "note" TEXT,

    CONSTRAINT "ConsultationExamFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drug_genericName_idx" ON "Drug"("genericName");

-- CreateIndex
CREATE INDEX "Drug_organizationId_idx" ON "Drug"("organizationId");

-- CreateIndex
CREATE INDEX "StockItem_organizationId_idx" ON "StockItem"("organizationId");

-- CreateIndex
CREATE INDEX "StockItem_drugId_idx" ON "StockItem"("drugId");

-- CreateIndex
CREATE INDEX "StockItem_manufacturerId_idx" ON "StockItem"("manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_itemId_organizationId_key" ON "StockItem"("itemId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPack_itemId_name_key" ON "ItemPack"("itemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_name_key" ON "Supplier"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_organizationId_name_key" ON "Manufacturer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "StockBatch_itemId_expiryDate_idx" ON "StockBatch"("itemId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_itemId_batchNumber_key" ON "StockBatch"("itemId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_id_organizationId_key" ON "StockBatch"("id", "organizationId");

-- CreateIndex
CREATE INDEX "StorageLocation_organizationId_branchId_idx" ON "StorageLocation"("organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_organizationId_code_key" ON "StorageLocation"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_id_organizationId_key" ON "StorageLocation"("id", "organizationId");

-- CreateIndex
CREATE INDEX "StockBalance_organizationId_itemId_status_idx" ON "StockBalance"("organizationId", "itemId", "status");

-- CreateIndex
CREATE INDEX "StockBalance_batchId_idx" ON "StockBalance"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_locationId_batchId_status_key" ON "StockBalance"("locationId", "batchId", "status");

-- CreateIndex
CREATE INDEX "StockTransaction_organizationId_occurredAt_idx" ON "StockTransaction"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockTransaction_sourceType_sourceId_idx" ON "StockTransaction"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "StockMovement_transactionId_idx" ON "StockMovement"("transactionId");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_createdAt_idx" ON "StockMovement"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_locationId_itemId_createdAt_idx" ON "StockMovement"("locationId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_transactionId_key" ON "GoodsReceipt"("transactionId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_organizationId_status_receivedAt_idx" ON "GoodsReceipt"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "GoodsReceipt_supplierId_receivedAt_idx" ON "GoodsReceipt"("supplierId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_organizationId_number_key" ON "GoodsReceipt"("organizationId", "number");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_receiptId_idx" ON "GoodsReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_itemId_idx" ON "GoodsReceiptItem"("itemId");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_batchId_idx" ON "GoodsReceiptItem"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationExamFinding_consultationId_element_key" ON "ConsultationExamFinding"("consultationId", "element");

-- AddForeignKey
ALTER TABLE "Drug" ADD CONSTRAINT "Drug_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_itemId_organizationId_fkey" FOREIGN KEY ("itemId", "organizationId") REFERENCES "BillableItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPack" ADD CONSTRAINT "ItemPack_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manufacturer" ADD CONSTRAINT "Manufacturer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_itemId_organizationId_fkey" FOREIGN KEY ("itemId", "organizationId") REFERENCES "StockItem"("itemId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "StorageLocation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_batchId_organizationId_fkey" FOREIGN KEY ("batchId", "organizationId") REFERENCES "StockBatch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "StockTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "StorageLocation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_organizationId_fkey" FOREIGN KEY ("batchId", "organizationId") REFERENCES "StockBatch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "StockTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ItemPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_itemCostId_fkey" FOREIGN KEY ("itemCostId") REFERENCES "ItemCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationExamFinding" ADD CONSTRAINT "ConsultationExamFinding_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
