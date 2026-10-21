// Pure rules for PRD 12 §4 (no DB access) — unit-tested in items.rules.spec.ts.

export type SelfPayInput = {
    basis: 'MANUAL' | 'MARKUP';
    amount?: number;
    percent?: number;
    cost?: unknown;
};

export type Refusal = { reason: string; forbidden?: true };

/**
 * Why a new item's self-pay line is refused, or null (§4.2, §6.1). Each basis carries exactly its
 * own fields, mirroring the item_price_basis_fields CHECK, so the caller gets a 400 that names the
 * field instead of a constraint error. `forbidden` marks a missing permission (403).
 */
export function selfPayRefusal(selfPay: SelfPayInput, permissions: string[]): Refusal | null {
    if (selfPay.basis === 'MANUAL') {
        if (selfPay.amount === undefined) return { reason: 'A MANUAL self-pay price needs an amount' };
        if (selfPay.percent !== undefined || selfPay.cost !== undefined) {
            return { reason: 'A MANUAL self-pay price takes only an amount, not a percent or cost' };
        }
        return null;
    }

    if (selfPay.percent === undefined || selfPay.cost === undefined) {
        return { reason: 'A MARKUP self-pay price needs a percent and the cost it is marked up from' };
    }
    if (selfPay.amount !== undefined) return { reason: 'A MARKUP self-pay price is worked out from cost, so it takes no amount' };
    // the route checks item + price permissions; recording a cost is only needed for MARKUP (PRD 12 §10)
    if (!permissions.includes('billable.cost.create')) return { reason: 'Missing permission: billable.cost.create', forbidden: true };
    return null;
}

/**
 * Why an item update matched no row (§4.2). The update only moves an item to a category of the
 * same kind, so this runs only after it failed, to say whether the item is missing or the kinds differ.
 */
export function itemUpdateRefusal(found: { kind: string } | null, targetKind: string | null): Refusal {
    if (!found) return { reason: 'Billable item not found' };
    if (targetKind && found.kind !== targetKind) {
        return { reason: `An item can only move to a category of the same kind (${found.kind}, not ${targetKind}), so its plan benefit doesn't change` };
    }
    return { reason: 'Billable item not found' };
}
