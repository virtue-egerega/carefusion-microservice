// Pure rules for PRD 15 §4.1 (no DB access) — unit-tested in item-units.rules.spec.ts.

export type UnitUse = 'SELLING' | 'PURCHASE';

export type UnitForCheck = { name: string; status: string; kinds: string[]; usedForSelling: boolean; usedForPurchase: boolean };

/**
 * Why a unit can't be used here, or null (§4.1): it must be active, offered for that use (selling or
 * purchase), and belong to the item's kind. A unit found by name is never widened to fit; the hospital
 * edits its own unit instead.
 */
export function itemUnitRefusal(unit: UnitForCheck, use: UnitUse, kind: string): string | null {
    if (unit.status !== 'ACTIVE') return `The unit ${unit.name} is inactive`;
    if (use === 'SELLING' && !unit.usedForSelling) return `${unit.name} isn't a selling unit`;
    if (use === 'PURCHASE' && !unit.usedForPurchase) return `${unit.name} isn't a purchase unit`;
    if (!unit.kinds.includes(kind)) return `${unit.name} isn't a unit for ${kind} items`;
    return null;
}

/** Why a unit is given both or neither way, or null: by id (picked) or by name (typed), exactly one. */
export function unitGivenRefusal(label: string, byId?: string, byName?: unknown): string | null {
    return !byId === !byName ? `Give the ${label}: ${label}Id to pick one, or ${label}: { name } to find or add it` : null;
}
