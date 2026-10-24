// Pure rules for PRD 15 §3.1 (no DB access) — unit-tested in drugs.rules.spec.ts.

export type Refusal = { reason: string; forbidden?: true };

/**
 * The drugs an organisation sees: system rows (no owner) plus its own (§3.1). `source` narrows it
 * to one or the other. For Prisma `where`.
 */
export function visibleDrugs(organizationId: string, source?: 'SYSTEM' | 'HOSPITAL') {
    if (source === 'SYSTEM') return { organizationId: null };
    if (source === 'HOSPITAL') return { organizationId };
    return { OR: [{ organizationId: null }, { organizationId }] };
}

/**
 * Why a drug update matched no row. The update only matches the caller's own drugs, so this runs
 * only after it failed, to tell a system drug (403: CareFusion owns it) from a missing one.
 */
export function drugUpdateRefusal(found: { organizationId: string | null } | null): Refusal {
    if (found && found.organizationId === null) {
        return { reason: "System drugs can't be changed. Add the hospital's own drug if this one doesn't fit", forbidden: true };
    }
    return { reason: 'Drug not found' };
}
