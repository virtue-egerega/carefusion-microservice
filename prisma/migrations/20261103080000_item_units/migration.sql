-- Item units (PRD 15 §4.1): selling and purchase units become a list, seeded by CareFusion and extendable by each
-- hospital, instead of typed text. Prisma can't express this: the units already typed on billable and stock items
-- have to be carried over to the list before the text columns go. Everything runs here, matching what Prisma would
-- create, so the Prisma migration that follows finds nothing left to do.

-- ── ItemUnit ──────────────────────────────────────────────────────────────────
CREATE TABLE "ItemUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "pluralName" TEXT NOT NULL,
    "kinds" "ServiceCategory"[],
    "usedForSelling" BOOLEAN NOT NULL,
    "usedForPurchase" BOOLEAN NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ItemUnit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemUnit_organizationId_idx" ON "ItemUnit"("organizationId");
ALTER TABLE "ItemUnit" ADD CONSTRAINT "ItemUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- one unit per owner whatever the case or spacing; seeded units share the null owner
CREATE UNIQUE INDEX "ItemUnit_name" ON "ItemUnit" ("organizationId", lower(btrim("name"))) NULLS NOT DISTINCT;

-- the seeded units (src/billables/item-units/item-units.catalog.ts); the seeder adds any added there later
INSERT INTO "ItemUnit" ("id", "name", "pluralName", "kinds", "usedForSelling", "usedForPurchase", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Tablet', 'Tablets', ARRAY['PHARMACY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Capsule', 'Capsules', ARRAY['PHARMACY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Card', 'Cards', ARRAY['PHARMACY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Ampoule', 'Ampoules', ARRAY['PHARMACY']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Vial', 'Vials', ARRAY['PHARMACY']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Suppository', 'Suppositories', ARRAY['PHARMACY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Pessary', 'Pessaries', ARRAY['PHARMACY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Inhaler', 'Inhalers', ARRAY['PHARMACY']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Millilitre', 'Millilitres', ARRAY['PHARMACY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Cup', 'Cups', ARRAY['PHARMACY']::"ServiceCategory"[], false, true, now()),
  (gen_random_uuid()::text, 'Bottle', 'Bottles', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Sachet', 'Sachets', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Tube', 'Tubes', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Jar', 'Jars', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Tin', 'Tins', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Pack', 'Packs', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Piece', 'Pieces', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Pair', 'Pairs', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Roll', 'Rolls', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Kit', 'Kits', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], true, true, now()),
  (gen_random_uuid()::text, 'Carton', 'Cartons', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], false, true, now()),
  (gen_random_uuid()::text, 'Box', 'Boxes', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], false, true, now()),
  (gen_random_uuid()::text, 'Case', 'Cases', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], false, true, now()),
  (gen_random_uuid()::text, 'Bag', 'Bags', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], false, true, now()),
  (gen_random_uuid()::text, 'Dozen', 'Dozens', ARRAY['PHARMACY', 'CONSUMABLE']::"ServiceCategory"[], false, true, now()),
  (gen_random_uuid()::text, 'Visit', 'Visits', ARRAY['CONSULTATION']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Test', 'Tests', ARRAY['LABORATORY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Scan', 'Scans', ARRAY['RADIOLOGY']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Procedure', 'Procedures', ARRAY['PROCEDURE', 'THEATRE']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Session', 'Sessions', ARRAY['PROCEDURE', 'OTHER']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Day', 'Days', ARRAY['ADMISSION']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Night', 'Nights', ARRAY['ADMISSION']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Hour', 'Hours', ARRAY['THEATRE', 'ADMISSION']::"ServiceCategory"[], true, false, now()),
  (gen_random_uuid()::text, 'Service', 'Services', ARRAY['REGISTRATION', 'OTHER']::"ServiceCategory"[], true, false, now());

-- ── BillableItem.sellingUnit (text) -> sellingUnitId ──────────────────────────
-- A typed unit that matches a seeded one by name or plural (any case) uses it; any other becomes the hospital's
-- own unit, offered for the kinds of the items that used it. Nothing is guessed or lost.
INSERT INTO "ItemUnit" ("id", "organizationId", "name", "pluralName", "kinds", "usedForSelling", "usedForPurchase", "updatedAt")
SELECT gen_random_uuid()::text, b."organizationId", initcap(btrim(b."sellingUnit")), initcap(btrim(b."sellingUnit")),
       array_agg(DISTINCT c."kind"), true, false, now()
FROM "BillableItem" b JOIN "BillableCategory" c ON c."id" = b."categoryId"
WHERE NOT EXISTS (
    SELECT 1 FROM "ItemUnit" u WHERE u."organizationId" IS NULL
      AND lower(btrim(b."sellingUnit")) IN (lower(u."name"), lower(u."pluralName"))
)
GROUP BY b."organizationId", initcap(btrim(b."sellingUnit"));

ALTER TABLE "BillableItem" ADD COLUMN "sellingUnitId" TEXT;
UPDATE "BillableItem" b SET "sellingUnitId" = (
    SELECT u."id" FROM "ItemUnit" u
    WHERE (u."organizationId" IS NULL OR u."organizationId" = b."organizationId")
      AND lower(btrim(b."sellingUnit")) IN (lower(u."name"), lower(u."pluralName"))
    ORDER BY u."organizationId" NULLS FIRST
    LIMIT 1
);
ALTER TABLE "BillableItem" ALTER COLUMN "sellingUnitId" SET NOT NULL;
ALTER TABLE "BillableItem" DROP COLUMN "sellingUnit";
CREATE INDEX "BillableItem_sellingUnitId_idx" ON "BillableItem"("sellingUnitId");
ALTER TABLE "BillableItem" ADD CONSTRAINT "BillableItem_sellingUnitId_fkey" FOREIGN KEY ("sellingUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── StockItem.purchaseUnitName (text) -> purchaseUnitId ───────────────────────
-- The same carry-over for purchase units. A seeded unit used here isn't widened: it keeps its own flags.
INSERT INTO "ItemUnit" ("id", "organizationId", "name", "pluralName", "kinds", "usedForSelling", "usedForPurchase", "updatedAt")
SELECT gen_random_uuid()::text, s."organizationId", initcap(btrim(s."purchaseUnitName")), initcap(btrim(s."purchaseUnitName")),
       array_agg(DISTINCT c."kind"), false, true, now()
FROM "StockItem" s
JOIN "BillableItem" b ON b."id" = s."itemId"
JOIN "BillableCategory" c ON c."id" = b."categoryId"
WHERE NOT EXISTS (
    SELECT 1 FROM "ItemUnit" u
    WHERE (u."organizationId" IS NULL OR u."organizationId" = s."organizationId")
      AND lower(btrim(s."purchaseUnitName")) IN (lower(u."name"), lower(u."pluralName"))
)
GROUP BY s."organizationId", initcap(btrim(s."purchaseUnitName"));

ALTER TABLE "StockItem" ADD COLUMN "purchaseUnitId" TEXT;
UPDATE "StockItem" s SET "purchaseUnitId" = (
    SELECT u."id" FROM "ItemUnit" u
    WHERE (u."organizationId" IS NULL OR u."organizationId" = s."organizationId")
      AND lower(btrim(s."purchaseUnitName")) IN (lower(u."name"), lower(u."pluralName"))
    ORDER BY u."organizationId" NULLS FIRST
    LIMIT 1
);
ALTER TABLE "StockItem" ALTER COLUMN "purchaseUnitId" SET NOT NULL;
ALTER TABLE "StockItem" DROP COLUMN "purchaseUnitName";
CREATE INDEX "StockItem_purchaseUnitId_idx" ON "StockItem"("purchaseUnitId");
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_purchaseUnitId_fkey" FOREIGN KEY ("purchaseUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
