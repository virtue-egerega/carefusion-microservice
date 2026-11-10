// Pure rules for PRD 16 §3 (no DB access) — unit-tested in prescriptions.rules.spec.ts.
import { visibleMedicines } from '../medicine-management/medicines.rules';

export type PrescribableMedicinesQuery = {
    search?:         string;
    therapeuticUse?: string;
    dosageForm?:     string;
    route?:          string;
    bodySystem?:     string;
    legalCategory?:  string;
    controlled?:     boolean;
};

/**
 * The medicines a prescriber can pick from, for Prisma `where` (16 §3): every active medicine the
 * organisation sees, seeded or its own. Stock is never consulted; whether the hospital holds it is
 * the dispensary's question. `search` matches the name, strength, an alias or an ingredient
 * (searchText, already lower case) or the name of one of its therapeutic uses ("malaria").
 * Generic so the caller's enum types reach Prisma.
 */
export function prescribableMedicines<Q extends PrescribableMedicinesQuery>(organizationId: string, query: Q) {
    const search = query.search?.trim();
    return {
        AND: [
            visibleMedicines(organizationId),
            {
                status: 'ACTIVE' as const,
                ...(query.dosageForm && { dosageForm: query.dosageForm }),
                ...(query.route && { route: query.route }),
                ...(query.bodySystem && { bodySystems: { has: query.bodySystem } }),
                ...(query.legalCategory && { legalCategory: query.legalCategory }),
                ...(query.controlled !== undefined && { controlled: query.controlled }),
                ...(query.therapeuticUse && { therapeuticUses: { some: { use: { code: query.therapeuticUse } } } }),
            },
            ...(search
                ? [{
                    OR: [
                        { searchText: { contains: search.toLowerCase() } },
                        { therapeuticUses: { some: { use: { name: { contains: search, mode: 'insensitive' as const } } } } },
                    ],
                }]
                : []),
        ],
    };
}
