// Pure rules for PRD 15 §3.2–3.3 (no DB access) — unit-tested in stock-items.rules.spec.ts.

export type Refusal = { reason: string; notFound?: true };

type Linked = { status: string } | null | undefined;

export type StockItemCheck = {
    kind:          string;        // the item's category kind (ServiceCategory)
    medicineId:    string | null; // the medicine the item will have after this change
    medicine?:     Linked;        // undefined: not being set; null: not found (or not visible)
    manufacturer?: Linked;        // undefined: not being set; null: not found in the organisation
};

/**
 * Why stocking an item (or changing its stock settings) is refused, or null (§3.3). A PHARMACY item
 * must name its medicine, other kinds can't, and a medicine or manufacturer being set must exist and be active.
 */
export function stockItemRefusal({ kind, medicineId, medicine, manufacturer }: StockItemCheck): Refusal | null {
    if (kind === 'PHARMACY' && !medicineId) return { reason: 'A PHARMACY item must name its medicine' };
    if (kind !== 'PHARMACY' && medicineId) return { reason: `Only PHARMACY items name a medicine; this item is ${kind}` };

    if (medicine === null) return { reason: 'Medicine not found', notFound: true };
    if (medicine && medicine.status !== 'ACTIVE') return { reason: 'That medicine is inactive' };

    if (manufacturer === null) return { reason: 'Manufacturer not found', notFound: true };
    if (manufacturer && manufacturer.status !== 'ACTIVE') return { reason: 'That manufacturer is inactive' };
    return null;
}

type PackState = { status: string; isDefault: boolean };

/**
 * A pack's default flag after a change (§4), or why the change is refused. Only an active pack can
 * be the default, so deactivating the default pack also clears the flag.
 */
export function packDefaultAfter(current: PackState, change: { status?: string; isDefault?: boolean }): { isDefault: boolean } | Refusal {
    const status = change.status ?? current.status;
    const isDefault = change.isDefault ?? current.isDefault;
    if (status === 'ACTIVE') return { isDefault };
    if (change.isDefault) return { reason: "An inactive pack can't be the default" };
    return { isDefault: false };
}
