import type { $Enums, Prisma } from '../../../generated/prisma/client';
import { encounterNumberIn } from './encounter-codes';

export type EncounterListFilters = {
    status?:        $Enums.EncounterStatus[];
    encounterType?: $Enums.EncounterType;
    visitType?:     $Enums.VisitType[];
    clinicId?:      string;
    from?:          Date;
    to?:            Date;
    search?:        string;
};

/**
 * An encounter list's filters as a Prisma `where` (11 §19). `search` is an encounter code (matched by
 * its number) or, otherwise, words in the reason for visit: every word must appear.
 */
export function encounterListWhere(f: EncounterListFilters): Prisma.EncounterWhereInput {
    const search = f.search?.trim();
    const encounterNumber = search ? encounterNumberIn(search) : null;
    const words = search && encounterNumber === null ? search.split(/\s+/) : [];

    return {
        ...(f.status?.length ? { status: { in: f.status } } : {}),
        ...(f.encounterType && { encounterType: f.encounterType }),
        ...(f.visitType?.length ? { visitType: { in: f.visitType } } : {}),
        ...(f.clinicId && { clinicId: f.clinicId }),
        ...((f.from || f.to) && { arrivedAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
        ...(encounterNumber !== null && { encounterNumber }),
        ...(words.length ? { AND: words.map(word => ({ reasonForVisit: { contains: word, mode: 'insensitive' as const } })) } : {}),
    };
}
