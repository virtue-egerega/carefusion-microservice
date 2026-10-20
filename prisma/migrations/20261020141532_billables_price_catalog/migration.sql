-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('TARIFF', 'DISCOUNT', 'MARKUP', 'MANUAL');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('PAYER_LINE', 'PAYER_DISCOUNT', 'SELF_PAY');

-- AlterEnum
ALTER TYPE "ServiceCategory" ADD VALUE 'CONSUMABLE';

-- CreateTable
CREATE TABLE "BillableCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ServiceCategory" NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BillableCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillableItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "systemKey" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BillableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCost" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "packCost" DECIMAL(14,2) NOT NULL,
    "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "endReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,

    CONSTRAINT "ItemCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPrice" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "payerId" TEXT,
    "basis" "PriceBasis" NOT NULL,
    "amount" DECIMAL(14,2),
    "percent" DECIMAL(5,2),
    "agreementId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "endReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,

    CONSTRAINT "ItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerAgreement" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT,
    "signedOn" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "documentRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PayerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerDiscount" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "endReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,

    CONSTRAINT "PayerDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillableCategory_organizationId_kind_idx" ON "BillableCategory"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BillableCategory_organizationId_name_key" ON "BillableCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "BillableItem_organizationId_categoryId_status_idx" ON "BillableItem"("organizationId", "categoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillableItem_organizationId_code_key" ON "BillableItem"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BillableItem_organizationId_systemKey_key" ON "BillableItem"("organizationId", "systemKey");

-- CreateIndex
CREATE INDEX "ItemCost_itemId_effectiveFrom_idx" ON "ItemCost"("itemId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ItemPrice_itemId_payerId_effectiveFrom_idx" ON "ItemPrice"("itemId", "payerId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ItemPrice_payerId_effectiveFrom_idx" ON "ItemPrice"("payerId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ItemPrice_agreementId_idx" ON "ItemPrice"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "PayerAgreement_payerId_reference_key" ON "PayerAgreement"("payerId", "reference");

-- CreateIndex
CREATE INDEX "PayerDiscount_payerId_effectiveFrom_idx" ON "PayerDiscount"("payerId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "BillableCategory" ADD CONSTRAINT "BillableCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableItem" ADD CONSTRAINT "BillableItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableItem" ADD CONSTRAINT "BillableItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BillableCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCost" ADD CONSTRAINT "ItemCost_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BillableItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrice" ADD CONSTRAINT "ItemPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BillableItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrice" ADD CONSTRAINT "ItemPrice_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrice" ADD CONSTRAINT "ItemPrice_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PayerAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerAgreement" ADD CONSTRAINT "PayerAgreement_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerDiscount" ADD CONSTRAINT "PayerDiscount_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
