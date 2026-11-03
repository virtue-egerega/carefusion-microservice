// Pure rules for PRD 12 §4 (no DB access) — unit-tested in items.rules.spec.ts.

export type SelfPayInput = {
    basis: 'MANUAL' | 'MARKUP';
    sellingUnitPrice?: number;
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
        if (selfPay.sellingUnitPrice === undefined) return { reason: 'A MANUAL self-pay price needs a selling unit price' };
        if (selfPay.percent !== undefined || selfPay.cost !== undefined) {
            return { reason: 'A MANUAL self-pay price takes only a selling unit price, not a percent or cost' };
        }
        return null;
    }

    if (selfPay.percent === undefined || selfPay.cost === undefined) {
        return { reason: 'A MARKUP self-pay price needs a percent and the cost it is marked up from' };
    }
    if (selfPay.sellingUnitPrice !== undefined) return { reason: 'A MARKUP self-pay price is worked out from cost, so it takes no selling unit price' };
    // the route checks item + price permissions; recording a cost is only needed for MARKUP (PRD 12 §10)
    if (!permissions.includes('billable.cost.create')) return { reason: 'Missing permission: billable.cost.create', forbidden: true };
    return null;
}

/**
 * Why an item update matched no row (§4.2). The update only moves an item to a category of the
 * same kind, and only changes the selling unit of an item that has never held stock (PRD 15 §3.4), so this
 * runs only after it failed, to say whether the item is missing, the kinds differ, or the selling unit is locked.
 */
export function itemUpdateRefusal(
    found: { kind: string; sellingUnitId?: string; sellingUnitName?: string; hasStock?: boolean } | null,
    targetKind: string | null,
    newSellingUnitId?: string,
): Refusal {
    if (!found) return { reason: 'Billable item not found' };
    if (targetKind && found.kind !== targetKind) {
        return { reason: `An item can only move to a category of the same kind (${found.kind}, not ${targetKind}), so its plan benefit doesn't change` };
    }
    if (newSellingUnitId !== undefined && found.hasStock && found.sellingUnitId !== newSellingUnitId) {
        return { reason: `This item has stock counted in ${found.sellingUnitName ?? 'its selling unit'}, so its selling unit can't change. Create a new item instead` };
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

export type PriceLineInput = {
    basis:             'TARIFF' | 'DISCOUNT' | 'MARKUP' | 'MANUAL';
    payerId?:          string;
    sellingUnitPrice?: number;
    percent?:          number;
    agreementId?:      string;
};

/**
 * Why a new price line is refused, or null (§6.1). Mirrors the item_price_basis_fields CHECK so the
 * caller gets a 400 naming the field: each basis carries exactly its own fields, the self-pay line is
 * MANUAL or MARKUP, and only payer lines carry an agreement (required for a TARIFF).
 */
export function priceLineRefusal(line: PriceLineInput): string | null {
    const selfPay = !line.payerId;
    if (selfPay && (line.basis === 'TARIFF' || line.basis === 'DISCOUNT')) {
        return `The self-pay line is MANUAL or MARKUP, not ${line.basis}`;
    }
    if (selfPay && line.agreementId) return 'Only a payer line can name an agreement';

    switch (line.basis) {
        case 'TARIFF':
            if (line.sellingUnitPrice === undefined || !line.agreementId) return 'A TARIFF line needs a selling unit price and the agreement that set it';
            if (line.percent !== undefined) return 'A TARIFF line takes no percent';
            return null;
        case 'MANUAL':
            if (line.sellingUnitPrice === undefined) return 'A MANUAL line needs a selling unit price';
            if (line.percent !== undefined) return 'A MANUAL line takes no percent';
            if (line.agreementId) return 'A MANUAL line names no agreement; use a TARIFF for an agreed price';
            return null;
        case 'DISCOUNT':
            if (line.percent === undefined || line.percent <= 0 || line.percent >= 100) return 'A DISCOUNT line needs a percent between 0 and 100';
            if (line.sellingUnitPrice !== undefined) return 'A DISCOUNT line takes no selling unit price';
            return null;
        case 'MARKUP':
            if (line.percent === undefined) return 'A MARKUP line needs a percent';
            if (line.sellingUnitPrice !== undefined) return 'A MARKUP line is worked out from cost, so it takes no selling unit price';
            return null;
    }
}
