import { DatabaseService } from '../../database/database.service';

// Year in the hospital's local time (11 §4.0); Africa/Lagos until organisations have a timezone setting
const YEAR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: '2-digit' });

/** "ENC-26-00476": the year the encounter opened, then its number, at least 5 digits (11 §4.0). */
export const encounterCode = (encounterNumber: number, openedAt: Date) =>
    `ENC-${YEAR.format(openedAt)}-${String(encounterNumber).padStart(5, '0')}`;

/**
 * The encounter number in a typed code ("ENC-26-00476", "enc-26-476"), or null if it isn't one.
 * Search matches the number: it's unique on its own, and the year is only a reading aid.
 */
export function encounterNumberIn(text: string): number | null {
    const match = /^ENC-\d{2}-(\d{1,9})$/i.exec(text.trim());
    return match ? Number(match[1]) : null;
}

/**
 * The organisation's next encounter number and its code, in one statement (11 §4.0). Call inside
 * the transaction that creates the encounter: the counter row stays locked until it commits, so two
 * check-ins never share a number, and a failed check-in rolls its number back.
 */
export async function nextEncounterCode(db: DatabaseService, organizationId: string, openedAt: Date) {
    const [row] = await db.client.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO "SequenceCounter" ("scope", "lastNumber") VALUES (${`encounter:${organizationId}`}, 1)
        ON CONFLICT ("scope") DO UPDATE SET "lastNumber" = "SequenceCounter"."lastNumber" + 1
        RETURNING "lastNumber"`;
    return { encounterNumber: row.lastNumber, code: encounterCode(row.lastNumber, openedAt) };
}
