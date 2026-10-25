-- This is an empty migration.

-- PRD 15 §3.1: rules Prisma can't express for Medicine.

-- One medicine per owner: generic name in any case + form + route. Seeded rows share the null owner.
CREATE UNIQUE INDEX "Medicine_identity" ON "Medicine" ("organizationId", lower("genericName"), "dosageForm", "route")
    NULLS NOT DISTINCT;

-- searchText is the name, aliases and ingredients in lower case, kept by the database so no writer can forget it.
CREATE FUNCTION medicine_search_text() RETURNS trigger AS $$
BEGIN
    NEW."searchText" := lower(concat_ws(' ', NEW."genericName", array_to_string(NEW."aliases", ' '), array_to_string(NEW."ingredients", ' ')));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medicine_search_text
    BEFORE INSERT OR UPDATE OF "genericName", "aliases", "ingredients" ON "Medicine"
    FOR EACH ROW EXECUTE FUNCTION medicine_search_text();

-- Partial matches ("parac", "acetamin") use the trigram index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Medicine_search_trgm" ON "Medicine" USING gin ("searchText" gin_trgm_ops);
