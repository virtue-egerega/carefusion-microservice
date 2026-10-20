-- Billables & price catalog integrity rules (PRD 12 §5.1, §6.2, §8.1).
-- Prisma can't express these: range-exclusion constraints and CHECKs.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── ItemCost ────────────────────────────────────────────────────────────────

-- no two live cost rows for an item overlap in time
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_no_overlap
  EXCLUDE USING gist ("itemId" WITH =, tsrange("effectiveFrom", "effectiveTo") WITH &&)
  WHERE ("cancelledAt" IS NULL);

ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_pack_cost_non_negative CHECK ("packCost" >= 0);
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_units_positive CHECK ("unitsPerPack" > 0);
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_period_valid
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- ── ItemPrice ───────────────────────────────────────────────────────────────

-- no two live lines for the same (item, payer) overlap in time; null payer = self-pay
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_no_overlap
  EXCLUDE USING gist (
    "itemId" WITH =,
    COALESCE("payerId", '') WITH =,
    tsrange("effectiveFrom", "effectiveTo") WITH &&
  ) WHERE ("cancelledAt" IS NULL);

-- each basis stores exactly its own fields; self-pay is MANUAL or MARKUP only
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_basis_fields CHECK (
  CASE "basis"
    WHEN 'TARIFF'   THEN "amount" IS NOT NULL AND "percent" IS NULL AND "agreementId" IS NOT NULL AND "payerId" IS NOT NULL
    WHEN 'MANUAL'   THEN "amount" IS NOT NULL AND "percent" IS NULL AND "agreementId" IS NULL
    WHEN 'DISCOUNT' THEN "percent" IS NOT NULL AND "amount" IS NULL AND "payerId" IS NOT NULL
                         AND "percent" > 0 AND "percent" < 100
    WHEN 'MARKUP'   THEN "percent" IS NOT NULL AND "amount" IS NULL AND "percent" >= 0
  END
);
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_self_pay_no_agreement
  CHECK ("payerId" IS NOT NULL OR "agreementId" IS NULL);
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_amount_non_negative
  CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_period_valid
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- ── PayerDiscount ───────────────────────────────────────────────────────────

ALTER TABLE "PayerDiscount" ADD CONSTRAINT payer_discount_no_overlap
  EXCLUDE USING gist ("payerId" WITH =, tsrange("effectiveFrom", "effectiveTo") WITH &&)
  WHERE ("cancelledAt" IS NULL);
ALTER TABLE "PayerDiscount" ADD CONSTRAINT payer_discount_percent_range
  CHECK (percent > 0 AND percent < 100);
ALTER TABLE "PayerDiscount" ADD CONSTRAINT payer_discount_period_valid
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
