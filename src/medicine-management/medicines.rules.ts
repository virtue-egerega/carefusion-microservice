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
 * A medicine with the same identity (generic name and strength in any case, form, route), for Prisma
 * `where`. The Medicine_identity index catches a hospital repeating its own medicine; this finds a seeded
 * one, which the index can't, since a hospital's row and a seeded row have different owners.
 */
export function sameMedicine<F extends string, R extends string>(
    medicine: { genericName: string; strength?: string | null; dosageForm: F; route: R },
) {
    const strength = medicine.strength?.trim();
    return {
        genericName: { equals: medicine.genericName.trim(), mode: 'insensitive' as const },
        strength:    strength ? { equals: strength, mode: 'insensitive' as const } : null,
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

/**
 * Why a hospital's medicine can't be merged into a seeded one (§3.1), or null. Same ownership rules as an
 * update; then it must still be active, and CareFusion must now seed a medicine with the same identity.
 */
export function mergeRefusal(
    found: { organizationId: string | null; status: string } | null,
    organizationId: string,
    seededMatch: { id: string } | null,
): Refusal | null {
    const refusal = medicineUpdateRefusal(found, organizationId);
    if (refusal) return found?.organizationId === null ? { reason: 'Seeded medicines are what others merge into; there is nothing to merge', forbidden: true } : refusal;
    if (found!.status !== 'ACTIVE') return { reason: 'This medicine is inactive; it may already have been merged' };
    if (!seededMatch) return { reason: 'No seeded medicine has the same name, strength, form and route, so there is nothing to merge into' };
    return null;
}
