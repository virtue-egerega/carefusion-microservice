import { DatabaseService } from '../database/database.service';

// createdBy / updatedBy are plain user ids (no relation), like the rest of the schema. These turn
// them into the people behind them for detail views, in one query for however many ids.

export type Actor = { id: string; firstName: string; middleName: string | null; lastName: string };

/** The users behind the given ids, keyed by id. Nulls and duplicates are skipped. */
export async function loadActors(db: DatabaseService, ids: (string | null | undefined)[]): Promise<Map<string, Actor>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();

    const users = await db.client.user.findMany({
        where:  { id: { in: unique } },
        select: { id: true, firstName: true, middleName: true, lastName: true },
    });
    return new Map(users.map(u => [u.id, u]));
}

/** Replaces a row's createdBy / updatedBy ids with the users (null if the id is unset or unknown). */
export function withActors<T extends { createdBy: string; updatedBy: string | null }>(row: T, actors: Map<string, Actor>) {
    return {
        ...row,
        createdBy: actors.get(row.createdBy) ?? null,
        updatedBy: row.updatedBy ? actors.get(row.updatedBy) ?? null : null,
    };
}
