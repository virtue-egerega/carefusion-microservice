-- This is an empty migration.

-- The medicines seeded before this change merged strengths into one row and lost them when the strength
-- columns moved; none is stocked yet. Clear them so the seeder adds one row per strength. Their use links
-- go with them (cascade); the therapeutic uses stay and are reused by code.
DELETE FROM "Medicine" WHERE "organizationId" IS NULL;

-- PRD 15 §3.1: strength is part of a medicine's identity. Allopurinol 100 mg and 300 mg tablets are two medicines.

DROP INDEX "Medicine_identity";
CREATE UNIQUE INDEX "Medicine_identity" ON "Medicine" ("organizationId", lower("genericName"), lower("strength"), "dosageForm", "route")
    NULLS NOT DISTINCT;

-- searchText now includes the strength, so "allopurinol 300" finds the 300 mg tablet.
CREATE OR REPLACE FUNCTION medicine_search_text() RETURNS trigger AS $$
BEGIN
    NEW."searchText" := lower(concat_ws(' ', NEW."genericName", NEW."strength", array_to_string(NEW."aliases", ' '), array_to_string(NEW."ingredients", ' ')));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER medicine_search_text ON "Medicine";
CREATE TRIGGER medicine_search_text
    BEFORE INSERT OR UPDATE OF "genericName", "strength", "aliases", "ingredients" ON "Medicine"
    FOR EACH ROW EXECUTE FUNCTION medicine_search_text();
