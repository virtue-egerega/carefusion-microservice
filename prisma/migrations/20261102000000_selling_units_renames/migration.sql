-- Selling unit and purchase unit (PRD 15 §4, §10, §11; 12 §5–6). Prisma can't express any of this:
-- it reads a rename as drop + add, which would lose every cost and price line and the price links on charges.
-- Renames run here first, so the Prisma migration that follows only adds, drops and retypes.

-- ── BillableItem: what one quantity sold means ────────────────────────────────
ALTER TABLE "BillableItem" RENAME COLUMN "unit" TO "sellingUnit";

-- ── ItemCost -> ItemCostPrice ─────────────────────────────────────────────────
ALTER TABLE "ItemCost" RENAME TO "ItemCostPrice";
ALTER TABLE "ItemCostPrice" RENAME COLUMN "packCost" TO "purchaseUnitCost";
ALTER TABLE "ItemCostPrice" RENAME COLUMN "unitsPerPack" TO "sellingUnitsPerPurchaseUnit";
ALTER TABLE "ItemCostPrice" RENAME CONSTRAINT "ItemCost_pkey" TO "ItemCostPrice_pkey";
ALTER TABLE "ItemCostPrice" RENAME CONSTRAINT "ItemCost_itemId_fkey" TO "ItemCostPrice_itemId_fkey";
ALTER INDEX "ItemCost_itemId_effectiveFrom_idx" RENAME TO "ItemCostPrice_itemId_effectiveFrom_idx";
ALTER TABLE "ItemCostPrice" RENAME CONSTRAINT item_cost_pack_cost_non_negative TO item_cost_purchase_unit_cost_non_negative;
ALTER TABLE "ItemCostPrice" RENAME CONSTRAINT item_cost_units_positive TO item_cost_selling_units_positive;

-- ── ItemPrice -> ItemSellingPrice ─────────────────────────────────────────────
ALTER TABLE "ItemPrice" RENAME TO "ItemSellingPrice";
ALTER TABLE "ItemSellingPrice" RENAME COLUMN "amount" TO "sellingUnitPrice";
ALTER TABLE "ItemSellingPrice" RENAME CONSTRAINT "ItemPrice_pkey" TO "ItemSellingPrice_pkey";
ALTER TABLE "ItemSellingPrice" RENAME CONSTRAINT "ItemPrice_itemId_fkey" TO "ItemSellingPrice_itemId_fkey";
ALTER TABLE "ItemSellingPrice" RENAME CONSTRAINT "ItemPrice_payerId_fkey" TO "ItemSellingPrice_payerId_fkey";
ALTER TABLE "ItemSellingPrice" RENAME CONSTRAINT "ItemPrice_agreementId_payerId_fkey" TO "ItemSellingPrice_agreementId_payerId_fkey";
ALTER INDEX "ItemPrice_itemId_payerId_effectiveFrom_idx" RENAME TO "ItemSellingPrice_itemId_payerId_effectiveFrom_idx";
ALTER INDEX "ItemPrice_payerId_effectiveFrom_idx" RENAME TO "ItemSellingPrice_payerId_effectiveFrom_idx";
ALTER INDEX "ItemPrice_agreementId_idx" RENAME TO "ItemSellingPrice_agreementId_idx";
ALTER TABLE "ItemSellingPrice" RENAME CONSTRAINT item_price_amount_non_negative TO item_price_selling_unit_price_non_negative;

-- ── Charge: what it was priced from ───────────────────────────────────────────
ALTER TABLE "Charge" RENAME COLUMN "itemPriceId" TO "itemSellingPriceId";
ALTER TABLE "Charge" RENAME COLUMN "itemCostId" TO "itemCostPriceId";
ALTER TABLE "Charge" RENAME CONSTRAINT "Charge_itemPriceId_fkey" TO "Charge_itemSellingPriceId_fkey";
ALTER TABLE "Charge" RENAME CONSTRAINT "Charge_itemCostId_fkey" TO "Charge_itemCostPriceId_fkey";

-- ── StockItem: one purchase unit per product ──────────────────────────────────
-- Added here, not by Prisma, so existing products can be filled from their default pack before ItemPack goes;
-- the defaults are dropped by the Prisma migration that follows.
ALTER TABLE "StockItem" ADD COLUMN "purchaseUnitName" TEXT NOT NULL DEFAULT 'Unit',
                        ADD COLUMN "sellingUnitsPerPurchaseUnit" INTEGER NOT NULL DEFAULT 1;
UPDATE "StockItem" s SET "purchaseUnitName" = p."name", "sellingUnitsPerPurchaseUnit" = p."unitsPerPack"
  FROM "ItemPack" p WHERE p."itemId" = s."itemId" AND p."isDefault";
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_selling_units_per_purchase_unit_positive"
  CHECK ("sellingUnitsPerPurchaseUnit" > 0);

-- ── GoodsReceiptItem: purchase units, as on the invoice ───────────────────────
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "packName" TO "purchaseUnitName";
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "unitsPerPack" TO "sellingUnitsPerPurchaseUnit";
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "packsDelivered" TO "purchaseUnitsDelivered";
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "packsAccepted" TO "purchaseUnitsAccepted";
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "packCost" TO "purchaseUnitCost";
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "itemCostId" TO "itemCostPriceId";
ALTER TABLE "GoodsReceiptItem" RENAME CONSTRAINT "GoodsReceiptItem_itemCostId_fkey" TO "GoodsReceiptItem_itemCostPriceId_fkey";
ALTER TABLE "GoodsReceiptItem" RENAME CONSTRAINT "GoodsReceiptItem_units_positive" TO "GoodsReceiptItem_selling_units_positive";
ALTER TABLE "GoodsReceiptItem" RENAME CONSTRAINT "GoodsReceiptItem_packs_valid" TO "GoodsReceiptItem_purchase_units_valid";
ALTER TABLE "GoodsReceiptItem" RENAME CONSTRAINT "GoodsReceiptItem_pack_cost_non_negative" TO "GoodsReceiptItem_purchase_unit_cost_non_negative";

-- ── Stock quantities in selling units, whole or half (Prisma retypes them to DECIMAL(12,1)) ──
ALTER TABLE "StockBalance" RENAME COLUMN "quantity" TO "sellingUnitQuantity";
ALTER TABLE "StockMovement" RENAME COLUMN "quantity" TO "sellingUnitQuantity";
ALTER TABLE "StockBalance" RENAME CONSTRAINT "StockBalance_quantity_non_negative" TO "StockBalance_selling_unit_quantity_non_negative";
ALTER TABLE "StockMovement" RENAME CONSTRAINT "StockMovement_quantity_non_zero" TO "StockMovement_selling_unit_quantity_non_zero";
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_whole_or_half"
  CHECK ("sellingUnitQuantity" * 2 = trunc("sellingUnitQuantity" * 2));
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_whole_or_half"
  CHECK ("sellingUnitQuantity" * 2 = trunc("sellingUnitQuantity" * 2));

-- Function bodies name columns as text, so a rename doesn't reach them: both are rewritten on the new name.
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS trigger AS $$
BEGIN
  INSERT INTO "StockBalance" ("id", "organizationId", "branchId", "locationId", "itemId", "batchId",
                              "status", "sellingUnitQuantity", "updatedAt")
  SELECT gen_random_uuid()::text, NEW."organizationId", l."branchId", NEW."locationId", NEW."itemId",
         NEW."batchId", NEW."status", NEW."sellingUnitQuantity", now()
  FROM "StorageLocation" l WHERE l."id" = NEW."locationId"
  ON CONFLICT ("locationId", "batchId", "status")
  DO UPDATE SET "sellingUnitQuantity" = "StockBalance"."sellingUnitQuantity" + EXCLUDED."sellingUnitQuantity",
                "updatedAt" = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_stock_transaction_balanced() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "StockTransaction" t JOIN "StockMovement" m ON m."transactionId" = t."id"
    WHERE t."id" = NEW."transactionId" AND t."type" IN ('STATUS_CHANGE')
    GROUP BY m."batchId" HAVING SUM(m."sellingUnitQuantity") <> 0
  ) THEN
    RAISE EXCEPTION 'stock transaction % does not balance', NEW."transactionId";
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

-- ── One name per hospital, whatever the case or spacing (15 §5) ──────────────
-- These replace the plain (organizationId, name) uniques, which the Prisma migration drops.
CREATE UNIQUE INDEX "BillableCategory_name" ON "BillableCategory" ("organizationId", lower(btrim("name")));
CREATE UNIQUE INDEX "Supplier_name" ON "Supplier" ("organizationId", lower(btrim("name")));
CREATE UNIQUE INDEX "Manufacturer_name" ON "Manufacturer" ("organizationId", lower(btrim("name")));
