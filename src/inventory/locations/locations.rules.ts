// Pure rules for PRD 15 §7 (no DB access) — unit-tested in locations.rules.spec.ts.

/**
 * Why a location update matched no row (§7.1). Deactivating is conditional on the location holding
 * no stock, so this runs only after the update failed, to say whether it's missing or still stocked.
 */
export function locationUpdateRefusal(found: { stockHeld: number } | null, deactivating: boolean): string {
    if (found && deactivating && found.stockHeld > 0) {
        return `This location still holds ${found.stockHeld} unit(s) of stock. Move or write it off before deactivating`;
    }
    return 'Storage location not found';
}
