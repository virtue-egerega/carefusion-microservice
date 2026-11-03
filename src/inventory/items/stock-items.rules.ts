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
 * Why stocking an item (or changing its stock settings) is refused, or null (§3.4). Naming a medicine is
 * what makes a product a drug: optional, because the pharmacy also sells sanitary pads and baby food, and
 * only a PHARMACY item can. A medicine or manufacturer being set must exist and be active.
 */
export function stockItemRefusal({ kind, medicineId, medicine, manufacturer }: StockItemCheck): Refusal | null {
    if (kind !== 'PHARMACY' && medicineId) return { reason: `Only PHARMACY items name a medicine; this item is ${kind}` };

    if (medicine === null) return { reason: 'Medicine not found', notFound: true };
    if (medicine && medicine.status !== 'ACTIVE') return { reason: 'That medicine is inactive' };

    if (manufacturer === null) return { reason: 'Manufacturer not found', notFound: true };
    if (manufacturer && manufacturer.status !== 'ACTIVE') return { reason: 'That manufacturer is inactive' };
    return null;
}

export type Forbidden = { reason: string; forbidden: true };

export type ProductInput = {
    categoryId?:       string;
    category?:         unknown;
    manufacturerId?:   string;
    manufacturer?:     unknown;
    sellingUnitPrice?: number;
    reason?:           string;
};

/**
 * Why a new product is refused before anything is read (§3.3), or null: the category is picked by id
 * or by name (exactly one), the manufacturer by at most one of the two, a first price comes with its
 * reason, and setting a price needs billable.price.create (`forbidden`: 403).
 */
export function productRefusal(product: ProductInput, permissions: string[]): Refusal | Forbidden | null {
    if (!product.categoryId === !product.category) return { reason: 'Give the category: categoryId, or category: { name } to find or create it' };
    if (product.manufacturerId && product.manufacturer) return { reason: 'Give manufacturerId or manufacturer, not both' };
    if ((product.sellingUnitPrice === undefined) !== (product.reason === undefined)) {
        return { reason: 'A selling price needs a reason, and a reason needs a selling price' };
    }
    if (product.sellingUnitPrice !== undefined && !permissions.includes('billable.price.create')) {
        return { reason: 'Missing permission: billable.price.create', forbidden: true };
    }
    return null;
}

export type ProductUnits = { purchaseUnitId: string; sellingUnitsPerPurchaseUnit: number; sellableInHalves: boolean };

/**
 * Why a change to a product's units is refused, or null (§3.4). They're required when an item is first
 * stocked, and fixed once it has stock: each would silently change what every balance means.
 */
export function unitsChangeRefusal(
    current: (ProductUnits & { hasStock: boolean }) | null,
    change: Partial<ProductUnits>,
): Refusal | null {
    if (!current) {
        return change.purchaseUnitId === undefined || change.sellingUnitsPerPurchaseUnit === undefined
            ? { reason: 'A newly stocked item needs its purchaseUnitId and sellingUnitsPerPurchaseUnit' }
            : null;
    }
    if (!current.hasStock) return null;
    const changed = (Object.keys(change) as (keyof ProductUnits)[])
        .filter(key => change[key] !== undefined && change[key] !== current[key]);
    return changed.length
        ? { reason: `This product has stock, so ${changed.join(', ')} can't change. Add a new product instead` }
        : null;
}
