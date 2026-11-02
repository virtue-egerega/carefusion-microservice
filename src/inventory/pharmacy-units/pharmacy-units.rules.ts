// Pure rules for PRD 15 §7 (no DB access) — unit-tested in pharmacy-units.rules.spec.ts.

/**
 * The store every branch starts with (§7.1), created with the branch: deliveries are received into it
 * until the hospital adds others. Branch codes are unique, so the unit code is too.
 */
export function mainPharmacyStore(branch: { organizationId: string; code: string }) {
    return {
        organizationId: branch.organizationId,
        code:           `STORE-${branch.code}`,
        name:           'Main Pharmacy Store',
        type:           'STORE' as const,
    };
}

/**
 * Why a pharmacy unit update matched no row (§7.1). Deactivating is conditional on the unit holding
 * no stock, so this runs only after the update failed, to say whether it's missing or still stocked.
 */
export function pharmacyUnitUpdateRefusal(found: { stockHeld: number } | null, deactivating: boolean): string {
    if (found && deactivating && found.stockHeld > 0) {
        return `This pharmacy unit still holds ${found.stockHeld} selling unit(s) of stock. Move or write it off before deactivating`;
    }
    return 'Pharmacy unit not found';
}
