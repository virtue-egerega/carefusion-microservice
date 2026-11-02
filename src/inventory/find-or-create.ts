import { DatabaseService } from '../database/database.service';

// Suppliers, manufacturers and billable categories are learnt while working (PRD 15 §5): a typed name
// is matched to the hospital's row ignoring case and surrounding spaces, or created. One
// insert-on-conflict against the lower(btrim(name)) unique index, so no lookup first and no race. The
// no-op update on conflict only makes RETURNING give back the existing row: matching never edits it.

export type Found = { id: string; status: string };

export async function findOrCreateManufacturer(
    db: DatabaseService, organizationId: string, input: { name: string; country?: string }, createdBy: string,
): Promise<Found> {
    const [row] = await db.client.$queryRaw<Found[]>`
        INSERT INTO "Manufacturer" ("id", "organizationId", "name", "country", "createdBy", "updatedAt")
        VALUES (gen_random_uuid()::text, ${organizationId}, ${input.name.trim()}, ${input.country ?? null}, ${createdBy}, now())
        ON CONFLICT ("organizationId", lower(btrim("name"))) DO UPDATE SET "name" = "Manufacturer"."name"
        RETURNING "id", "status"::text AS "status"`;
    return row;
}

export async function findOrCreateSupplier(
    db: DatabaseService, organizationId: string, input: { name: string; phone?: string[]; email?: string }, createdBy: string,
): Promise<Found> {
    const [row] = await db.client.$queryRaw<Found[]>`
        INSERT INTO "Supplier" ("id", "organizationId", "name", "phone", "email", "createdBy", "updatedAt")
        VALUES (gen_random_uuid()::text, ${organizationId}, ${input.name.trim()}, ${input.phone ?? []}::text[], ${input.email ?? null}, ${createdBy}, now())
        ON CONFLICT ("organizationId", lower(btrim("name"))) DO UPDATE SET "name" = "Supplier"."name"
        RETURNING "id", "status"::text AS "status"`;
    return row;
}

/** A created category gets `kind`; a matched one keeps its own, for the caller to check. */
export async function findOrCreateCategory(
    db: DatabaseService, organizationId: string, input: { name: string; kind: string }, createdBy: string,
): Promise<Found & { kind: string }> {
    const [row] = await db.client.$queryRaw<(Found & { kind: string })[]>`
        INSERT INTO "BillableCategory" ("id", "organizationId", "name", "kind", "createdBy", "updatedAt")
        VALUES (gen_random_uuid()::text, ${organizationId}, ${input.name.trim()}, ${input.kind}::"ServiceCategory", ${createdBy}, now())
        ON CONFLICT ("organizationId", lower(btrim("name"))) DO UPDATE SET "name" = "BillableCategory"."name"
        RETURNING "id", "status"::text AS "status", "kind"::text AS "kind"`;
    return row;
}
