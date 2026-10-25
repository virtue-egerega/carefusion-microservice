// Pure rules for PRD 15 §3.1 (no DB access) — unit-tested in medicines.rules.spec.ts.

export type Refusal = { reason: string; forbidden?: true };

export type MedicineSource = 'SYSTEM' | 'USER_ADDED';

/**
 * The medicines an organisation sees: seeded rows (no owner) plus its own (§3.1). `source` narrows it
 * to one or the other. For Prisma `where`.
 */
export function visibleMedicines(organizationId: string, source?: MedicineSource) {
    if (source === 'SYSTEM') return { organizationId: null };
    if (source === 'USER_ADDED') return { organizationId };
    return { OR: [{ organizationId: null }, { organizationId }] };
}

/** SYSTEM for a seeded medicine, USER_ADDED for one a hospital added. */
export const medicineSource = (organizationId: string | null): MedicineSource => (organizationId ? 'USER_ADDED' : 'SYSTEM');

/**
 * A medicine with the same identity (generic name in any case, form, route), for Prisma `where`. The
 * Medicine_identity index catches a hospital repeating its own medicine; this finds a seeded one, which
 * the index can't, since a hospital's row and a seeded row have different owners.
 */
export function sameMedicine<F extends string, R extends string>(medicine: { genericName: string; dosageForm: F; route: R }) {
    return {
        genericName: { equals: medicine.genericName.trim(), mode: 'insensitive' as const },
        dosageForm:  medicine.dosageForm,
        route:       medicine.route,
    };
}

/** The therapeutic use codes asked for that don't exist, in the order given. */
export function unknownUses(codes: string[], found: { code: string }[]): string[] {
    const known = new Set(found.map(use => use.code));
    return codes.filter(code => !known.has(code));
}

/**
 * Why a medicine can't be changed by this organisation, or null. Seeded medicines are CareFusion's
 * (403); another organisation's are reported as missing so they aren't revealed.
 */
export function medicineUpdateRefusal(found: { organizationId: string | null } | null, organizationId: string): Refusal | null {
    if (found && found.organizationId === null) {
        return { reason: "Seeded medicines can't be changed. Add the hospital's own medicine if this one doesn't fit", forbidden: true };
    }
    if (!found || found.organizationId !== organizationId) return { reason: 'Medicine not found' };
    return null;
}
