-- Storage locations become pharmacy units (PRD 15 §7): a branch's store or a dispensary. Prisma can't express
-- this: it reads the renames as drop + add, which would lose the Main Pharmacy Store every branch already has
-- (seeded), and every balance, movement and receipt pointing at one. Renames run here first, so the Prisma
-- migration that follows only drops the unit's storageCondition (conditions belong to the product).

-- ── StorageLocation -> PharmacyUnit ───────────────────────────────────────────
ALTER TABLE "StorageLocation" RENAME TO "PharmacyUnit";
ALTER TABLE "PharmacyUnit" RENAME CONSTRAINT "StorageLocation_pkey" TO "PharmacyUnit_pkey";
ALTER TABLE "PharmacyUnit" RENAME CONSTRAINT "StorageLocation_organizationId_fkey" TO "PharmacyUnit_organizationId_fkey";
ALTER TABLE "PharmacyUnit" RENAME CONSTRAINT "StorageLocation_branchId_fkey" TO "PharmacyUnit_branchId_fkey";
ALTER INDEX "StorageLocation_organizationId_branchId_idx" RENAME TO "PharmacyUnit_organizationId_branchId_idx";
ALTER INDEX "StorageLocation_organizationId_code_key" RENAME TO "PharmacyUnit_organizationId_code_key";
ALTER INDEX "StorageLocation_id_organizationId_key" RENAME TO "PharmacyUnit_id_organizationId_key";

-- ── LocationType -> PharmacyUnitType: a store or a dispensary ─────────────────
-- Wards, theatres and clinics holding stock come later (requisitions); any unit typed so until now
-- dispenses, so it becomes a dispensary.
CREATE TYPE "PharmacyUnitType" AS ENUM ('STORE', 'DISPENSARY');
ALTER TABLE "PharmacyUnit" ALTER COLUMN "type" TYPE "PharmacyUnitType"
  USING (CASE WHEN "type" = 'STORE' THEN 'STORE' ELSE 'DISPENSARY' END)::"PharmacyUnitType";
DROP TYPE "LocationType";

-- ── locationId -> pharmacyUnitId ──────────────────────────────────────────────
ALTER TABLE "StockBalance" RENAME COLUMN "locationId" TO "pharmacyUnitId";
ALTER INDEX "StockBalance_locationId_batchId_status_key" RENAME TO "StockBalance_pharmacyUnitId_batchId_status_key";
ALTER TABLE "StockBalance" RENAME CONSTRAINT "StockBalance_locationId_organizationId_fkey" TO "StockBalance_pharmacyUnitId_organizationId_fkey";

ALTER TABLE "StockMovement" RENAME COLUMN "locationId" TO "pharmacyUnitId";
ALTER INDEX "StockMovement_locationId_itemId_createdAt_idx" RENAME TO "StockMovement_pharmacyUnitId_itemId_createdAt_idx";
ALTER TABLE "StockMovement" RENAME CONSTRAINT "StockMovement_locationId_organizationId_fkey" TO "StockMovement_pharmacyUnitId_organizationId_fkey";

ALTER TABLE "GoodsReceipt" RENAME COLUMN "locationId" TO "pharmacyUnitId";
ALTER TABLE "GoodsReceipt" RENAME CONSTRAINT "GoodsReceipt_locationId_fkey" TO "GoodsReceipt_pharmacyUnitId_fkey";

ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "locationId" TO "putAwayPharmacyUnitId";
ALTER TABLE "GoodsReceiptItem" RENAME CONSTRAINT "GoodsReceiptItem_locationId_fkey" TO "GoodsReceiptItem_putAwayPharmacyUnitId_fkey";

-- The movement trigger names the table and column as text, so a rename doesn't reach it: rewritten on the new names.
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS trigger AS $$
BEGIN
  INSERT INTO "StockBalance" ("id", "organizationId", "branchId", "pharmacyUnitId", "itemId", "batchId",
                              "status", "sellingUnitQuantity", "updatedAt")
  SELECT gen_random_uuid()::text, NEW."organizationId", u."branchId", NEW."pharmacyUnitId", NEW."itemId",
         NEW."batchId", NEW."status", NEW."sellingUnitQuantity", now()
  FROM "PharmacyUnit" u WHERE u."id" = NEW."pharmacyUnitId"
  ON CONFLICT ("pharmacyUnitId", "batchId", "status")
  DO UPDATE SET "sellingUnitQuantity" = "StockBalance"."sellingUnitQuantity" + EXCLUDED."sellingUnitQuantity",
                "updatedAt" = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
