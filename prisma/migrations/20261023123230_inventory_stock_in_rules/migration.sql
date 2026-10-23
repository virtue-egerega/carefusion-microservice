-- Inventory integrity rules (PRD 15 §3.1, §4, §6, §8.1, §9.2, §10.1).
-- Prisma can't express these: expression and partial unique indexes, CHECKs and triggers.

-- One drug per owner: system rows (null owner) are unique among themselves, generic name case-insensitive (15 §3.1)
CREATE UNIQUE INDEX "Drug_identity" ON "Drug"("organizationId", lower("genericName"), "strength", "dosageForm", "route") NULLS NOT DISTINCT;

-- Packs (15 §4): a positive size, at most one default per item, a barcode names one pack
ALTER TABLE "ItemPack" ADD CONSTRAINT "ItemPack_units_positive" CHECK ("unitsPerPack" > 0);
CREATE UNIQUE INDEX "ItemPack_one_default_per_item" ON "ItemPack"("itemId") WHERE "isDefault";
CREATE UNIQUE INDEX "ItemPack_barcode_unique" ON "ItemPack"("barcode") WHERE "barcode" IS NOT NULL;

-- Batches (15 §6)
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_dates_valid"
  CHECK ("manufacturedOn" IS NULL OR "expiryDate" IS NULL OR "expiryDate" > "manufacturedOn");
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_recall_reference"
  CHECK ("qualityStatus" <> 'RECALLED' OR "recallReference" IS NOT NULL);

-- Balances never go negative; movements are never zero (15 §8.1, §9.2)
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantity_non_zero" CHECK ("quantity" <> 0);

-- The only writer of StockBalance: each movement is added to its balance row, creating it if needed.
-- Taking more than is there (or from a row that doesn't exist) fails the non-negative CHECK above.
CREATE FUNCTION apply_stock_movement() RETURNS trigger AS $$
BEGIN
  INSERT INTO "StockBalance" ("id", "organizationId", "branchId", "locationId", "itemId", "batchId",
                              "status", "quantity", "updatedAt")
  SELECT gen_random_uuid()::text, NEW."organizationId", l."branchId", NEW."locationId", NEW."itemId",
         NEW."batchId", NEW."status", NEW."quantity", now()
  FROM "StorageLocation" l WHERE l."id" = NEW."locationId"
  ON CONFLICT ("locationId", "batchId", "status")
  DO UPDATE SET "quantity" = "StockBalance"."quantity" + EXCLUDED."quantity", "updatedAt" = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_apply" AFTER INSERT ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- The ledger is append-only
CREATE FUNCTION reject_stock_movement_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock movements are append-only';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_immutable" BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_change();

-- Status changes (and, from slice 2, transfers) never change the total: checked at commit, per batch
CREATE FUNCTION check_stock_transaction_balanced() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "StockTransaction" t JOIN "StockMovement" m ON m."transactionId" = t."id"
    WHERE t."id" = NEW."transactionId" AND t."type" IN ('STATUS_CHANGE')
    GROUP BY m."batchId" HAVING SUM(m."quantity") <> 0
  ) THEN
    RAISE EXCEPTION 'stock transaction % does not balance', NEW."transactionId";
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "StockMovement_transaction_balanced" AFTER INSERT ON "StockMovement"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_transaction_balanced();

-- Goods receipts (15 §10.1)
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_delivery_has_supplier"
  CHECK ("type" = 'OPENING' OR "supplierId" IS NOT NULL);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_units_positive" CHECK ("unitsPerPack" > 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_packs_valid"
  CHECK ("packsDelivered" >= 0 AND "packsAccepted" >= 0 AND "packsAccepted" <= "packsDelivered");
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_reject_reason"
  CHECK ("packsAccepted" = "packsDelivered" OR "rejectReason" IS NOT NULL);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_pack_cost_non_negative" CHECK ("packCost" >= 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_receive_as"
  CHECK ("receiveAs" IN ('AVAILABLE', 'QUARANTINE'));
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_keep_cost_reason"
  CHECK ("updateCost" OR "keepCostReason" IS NOT NULL);
