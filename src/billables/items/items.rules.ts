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
 * same kind, and only changes the unit of an item that has never held stock (PRD 15 §3.3), so this
 * runs only after it failed, to say whether the item is missing, the kinds differ, or the unit is locked.
 */
export function itemUpdateRefusal(
    found: { kind: string; unit?: string; hasStock?: boolean } | null,
    targetKind: string | null,
    newUnit?: string,
): Refusal {
    if (!found) return { reason: 'Billable item not found' };
    if (targetKind && found.kind !== targetKind) {
        return { reason: `An item can only move to a category of the same kind (${found.kind}, not ${targetKind}), so its plan benefit doesn't change` };
    }
    if (newUnit !== undefined && found.hasStock && found.unit !== newUnit) {
        return { reason: `This item has stock counted in "${found.unit}", so its unit can't change. Create a new item instead` };
    }
    return { reason: 'Billable item not found' };
}

/** Why an item's clinic changes contradict themselves (§4.4): the same clinic added and removed. */
export function clinicChangeRefusal(add: string[] = [], remove: string[] = []): Refusal | null {
    const removing = new Set(remove);
    const both = add.filter(id => removing.has(id));
    return both.length ? { reason: `A clinic can't be both added and removed: ${both.join(', ')}` } : null;
}

/**
 * Splits one page of a clinic's list (its linked items first, then the rest) into the two queries:
 * the page takes from the linked items while they last, then carries on into the others.
 */
export function clinicPage(linkedCount: number, offset: number, limit: number) {
    const linkedTake = Math.max(0, Math.min(limit, linkedCount - offset));
    return {
        linked: { skip: offset, take: linkedTake },
        others: { skip: Math.max(0, offset - linkedCount), take: limit - linkedTake },
    };
}
