import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UnitUse, itemUnitRefusal, unitGivenRefusal } from './item-units.rules';

type FoundUnit = { id: string; name: string; status: string; kinds: string[]; usedForSelling: boolean; usedForPurchase: boolean };

/**
 * The unit an item is sold or bought in (15 §4.1), picked by id or typed by name, checked for its use and
 * the item's kind. A typed name matches a seeded or the hospital's own unit by name or plural, ignoring case
 * and spacing; if none matches, it becomes the hospital's own unit, made for that use and kind. A match is
 * never widened: one that doesn't fit is refused, and the hospital edits its own unit instead.
 */
export async function findItemUnit(
    db: DatabaseService,
    organizationId: string,
    given: { label: string; id?: string; byName?: { name: string } },
    use: UnitUse,
    kind: string,
    userId: string,
): Promise<{ id: string; name: string }> {
    const refusal = unitGivenRefusal(given.label, given.id, given.byName);
    if (refusal) throw new BadRequestException(refusal);

    let unit: FoundUnit | undefined;
    if (given.id) {
        unit = (await db.client.itemUnit.findFirst({
            where:  { id: given.id, OR: [{ organizationId: null }, { organizationId }] },
            select: { id: true, name: true, status: true, kinds: true, usedForSelling: true, usedForPurchase: true },
        })) ?? undefined;
        if (!unit) throw new NotFoundException(`The ${given.label} isn't one of the units`);
    } else {
        const name = given.byName!.name.trim();
        [unit] = await db.client.$queryRaw<FoundUnit[]>`
            SELECT "id", "name", "status"::text AS "status", "kinds"::text[] AS "kinds", "usedForSelling", "usedForPurchase"
            FROM "ItemUnit"
            WHERE ("organizationId" IS NULL OR "organizationId" = ${organizationId})
              AND lower(${name}) IN (lower("name"), lower("pluralName"))
            ORDER BY "organizationId" NULLS FIRST
            LIMIT 1`;
        if (!unit) {
            // a new unit of the hospital's own; the unique index settles two of the same name at once
            [unit] = await db.client.$queryRaw<FoundUnit[]>`
                INSERT INTO "ItemUnit" ("id", "organizationId", "name", "pluralName", "kinds", "usedForSelling", "usedForPurchase", "createdBy", "updatedAt")
                VALUES (gen_random_uuid()::text, ${organizationId}, ${name}, ${name}, ARRAY[${kind}]::"ServiceCategory"[],
                        ${use === 'SELLING'}, ${use === 'PURCHASE'}, ${userId}, now())
                ON CONFLICT ("organizationId", lower(btrim("name"))) DO UPDATE SET "name" = "ItemUnit"."name"
                RETURNING "id", "name", "status"::text AS "status", "kinds"::text[] AS "kinds", "usedForSelling", "usedForPurchase"`;
        }
    }

    const misfit = itemUnitRefusal({ ...unit, kinds: unit.kinds ?? [] }, use, kind);
    if (misfit) throw new BadRequestException(misfit);
    return { id: unit.id, name: unit.name };
}
