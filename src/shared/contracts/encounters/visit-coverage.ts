import { $Enums, Prisma } from '../../../../generated/prisma/client';

/**
 * The coverage a visit uses (10 §5): the one chosen, else the patient's highest-priority coverage
 * in force now. A Prisma `select` for `Patient.coverages`, so it joins into the patient read.
 */
export function visitCoverage(now: Date, chosenId?: string) {
    return {
        where: {
            status:    $Enums.PolicyStatus.ACTIVE,
            validFrom: { lte: now },
            OR:        [{ validTo: null }, { validTo: { gte: now } }],
            ...(chosenId && { id: chosenId }),
        },
        orderBy: { priority: 'asc' },
        take:    1,
        select:  { id: true },
    } satisfies Prisma.Patient$coveragesArgs;
}
