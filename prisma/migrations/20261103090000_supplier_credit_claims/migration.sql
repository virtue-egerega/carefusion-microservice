-- Invoice line totals and supplier credit claims (PRD 15 §10.1, §10.5). Prisma can't express this: the line total is
-- required, so existing receipt items get theirs from what they already hold before it becomes NOT NULL, and the
-- CHECKs below. Everything runs here, matching what Prisma would create, so the Prisma migration that follows finds
-- nothing left to do.

-- ── GoodsReceiptItem: what the invoice line says was paid ─────────────────────
ALTER TABLE "GoodsReceiptItem" ADD COLUMN "invoiceLineTotal" DECIMAL(14,2);
UPDATE "GoodsReceiptItem" SET "invoiceLineTotal" = "purchaseUnitCost" * "purchaseUnitsDelivered";
ALTER TABLE "GoodsReceiptItem" ALTER COLUMN "invoiceLineTotal" SET NOT NULL;

-- the line charges for at least one purchase unit: the cost of one is divided out of it
ALTER TABLE "GoodsReceiptItem" DROP CONSTRAINT "GoodsReceiptItem_purchase_units_valid";
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchase_units_valid"
  CHECK ("purchaseUnitsDelivered" >= 1 AND "purchaseUnitsAccepted" >= 0 AND "purchaseUnitsAccepted" <= "purchaseUnitsDelivered");
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_invoice_line_total_non_negative" CHECK ("invoiceLineTotal" >= 0);
-- the cost of one purchase unit is the line total divided out and rounded up (15 D14): never less, and under a kobo more
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchase_unit_cost_from_line_total"
  CHECK ("purchaseUnitCost" * "purchaseUnitsDelivered" >= "invoiceLineTotal"
         AND ("purchaseUnitCost" - 0.01) * "purchaseUnitsDelivered" < "invoiceLineTotal");

-- ── SupplierCreditClaim ───────────────────────────────────────────────────────
CREATE TYPE "SupplierClaimStatus" AS ENUM ('OUTSTANDING', 'SETTLED', 'WAIVED');
CREATE TYPE "SupplierClaimSettlement" AS ENUM ('CREDIT_NOTE', 'REFUND', 'REPLACEMENT');

CREATE TABLE "SupplierCreditClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "goodsReceiptItemId" TEXT NOT NULL,
    "purchaseUnitsClaimed" INTEGER NOT NULL,
    "purchaseUnitCost" DECIMAL(14,2) NOT NULL,
    "amountOwed" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SupplierClaimStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "settledAs" "SupplierClaimSettlement",
    "settlementReference" TEXT,
    "replacementGoodsReceiptId" TEXT,
    "settledAt" TIMESTAMP(3),
    "settledBy" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waivedBy" TEXT,
    "waiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "SupplierCreditClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierCreditClaim_goodsReceiptItemId_key" ON "SupplierCreditClaim"("goodsReceiptItemId");
CREATE INDEX "SupplierCreditClaim_organizationId_status_createdAt_idx" ON "SupplierCreditClaim"("organizationId", "status", "createdAt");
CREATE INDEX "SupplierCreditClaim_supplierId_status_idx" ON "SupplierCreditClaim"("supplierId", "status");
CREATE UNIQUE INDEX "SupplierCreditClaim_organizationId_number_key" ON "SupplierCreditClaim"("organizationId", "number");

ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_goodsReceiptItemId_fkey" FOREIGN KEY ("goodsReceiptItemId") REFERENCES "GoodsReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_replacementGoodsReceiptId_fkey" FOREIGN KEY ("replacementGoodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_units_positive" CHECK ("purchaseUnitsClaimed" > 0);
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_amount_non_negative" CHECK ("amountOwed" >= 0);
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_settled"
  CHECK (("status" = 'SETTLED') = ("settledAs" IS NOT NULL AND "settledAt" IS NOT NULL));
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_waived"
  CHECK (("status" = 'WAIVED') = ("waiveReason" IS NOT NULL AND "waivedAt" IS NOT NULL));
ALTER TABLE "SupplierCreditClaim" ADD CONSTRAINT "SupplierCreditClaim_replacement"
  CHECK ("settledAs" IS DISTINCT FROM 'REPLACEMENT' OR "replacementGoodsReceiptId" IS NOT NULL);
