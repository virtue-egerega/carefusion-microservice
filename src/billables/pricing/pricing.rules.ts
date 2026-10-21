// Pure pricing rules for PRD 12 §9 (no DB access) — unit-tested in pricing.rules.spec.ts.
import { Prisma } from '../../../generated/prisma/client';

type Money = Prisma.Decimal | number | string;

/** Rounds a worked-out price to whole kobo, half-up. Done once, as the last step (D12). */
export const toKobo = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** A line's amount: quantity × unit price, rounded once (13 D8). Quotes and charges both use it, so they agree. */
export const lineAmount = (unitPrice: Prisma.Decimal, quantity: Money) => toKobo(unitPrice.mul(quantity));

/**
 * A MARKUP price: packCost ÷ unitsPerPack × (100 + percent) / 100, rounded once (§5.2).
 * The per-unit cost is never rounded on its own, so ₦1,234.50 / 100 at 30% is ₦16.05, not ₦16.06.
 */
export function markupPrice(packCost: Money, unitsPerPack: number, percent: Money): Prisma.Decimal {
    const pct = new Prisma.Decimal(percent);
    return toKobo(new Prisma.Decimal(packCost).mul(pct.plus(100)).div(100).div(unitsPerPack));
}

type SelfPayLine = { basis: string; amount: Prisma.Decimal | null; percent: Prisma.Decimal | null };
type CostRow = { packCost: Prisma.Decimal; unitsPerPack: number };

/**
 * The self-pay price from the self-pay line and the cost in effect with it (§9.1 step 2).
 * Null when there's no line, or a MARKUP line has no cost: the item can't be priced (a data error).
 */
export function selfPayAmount(line: SelfPayLine | undefined, cost: CostRow | undefined): Prisma.Decimal | null {
    if (!line) return null;
    if (line.basis === 'MARKUP') return cost && line.percent ? markupPrice(cost.packCost, cost.unitsPerPack, line.percent) : null;
    return line.amount;
}

/** Rows in effect at `at`: started, not yet ended, not withdrawn (§6.3). For Prisma `where`. */
export const inEffectAt = (at: Date) => ({
    effectiveFrom: { lte: at },
    OR:            [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    cancelledAt:   null,
});

/**
 * The self-pay line and, given a payer, its line, in effect at `at`. At most one of each is in effect
 * (exclusion constraints), so `take: 2`, with the row's `payerId` telling them apart. For Prisma `where`.
 */
export const selfPayAndPayerLines = (payerId: string | undefined, at: Date) => ({
    AND: [{ OR: [{ payerId: null }, ...(payerId ? [{ payerId }] : [])] }, inEffectAt(at)],
});

/** A resolved price, ready to post as a charge (PRD 13 §3). Money is 2 dp. */
export type ChargePrice = {
    billableItemId:  string;
    description:     string;
    category:        string;            // the item category's kind (ServiceCategory)
    unitPrice:       Prisma.Decimal;
    basis:           string;            // PriceBasis
    source:          string;            // PriceSource
    itemPriceId:     string;
    itemCostId:      string | null;
    percent:         Prisma.Decimal | null;
    agreementId:     string | null;
    payerDiscountId: string | null;
};

export type PriceableItem = {
    id: string;
    name: string;
    status: string;
    category: { kind: string; status: string };
    prices: (SelfPayLine & { id: string })[];   // the self-pay line in effect, if any
    costs: (CostRow & { id: string })[];        // the cost in effect, if any
};

/** A price for an item at a time, for self-pay or a payer, and how it was reached (§9.2). Money is 2 dp. */
export type ResolvedPrice = {
    unitPrice:       Prisma.Decimal;
    basis:           string;            // PriceBasis
    source:          string;            // PriceSource
    itemPriceId:     string;            // the payer line (PAYER_LINE), else the self-pay line
    selfPayPriceId:  string;
    selfPayAmount:   Prisma.Decimal;
    agreementId:     string | null;
    payerDiscountId: string | null;
    percent:         Prisma.Decimal | null;
    itemCostId:      string | null;
    packCost:        Prisma.Decimal | null;
    unitsPerPack:    number | null;
};

type PayerLine = SelfPayLine & { id: string; agreementId: string | null };

export type PriceInputs = {
    item:      PriceableItem;                                          // `prices` holds the self-pay line in effect
    payer?:    { name: string; status: string };
    payerLine?: PayerLine;                                             // the payer's line in effect, if any
    discount?: { id: string; percent: Prisma.Decimal };                // the payer's default discount in effect, if any
};

/** `percent` off a price, rounded once (§9.2: taken off the self-pay price as charged). */
export const discounted = (price: Prisma.Decimal, percent: Money) =>
    toKobo(price.mul(new Prisma.Decimal(100).minus(percent)).div(100));

/**
 * The price rule of §9.1: the payer's line, else the payer's default discount off self-pay, else
 * self-pay. Or why the item can't be priced (inactive item, category or payer, no self-pay price,
 * or a payer MARKUP line with no cost).
 */
export function resolvePrice({ item, payer, payerLine, discount }: PriceInputs): ResolvedPrice | string {
    if (item.status !== 'ACTIVE') return `${item.name} is inactive`;
    if (item.category.status !== 'ACTIVE') return `${item.name} is in an inactive category`;

    const [line] = item.prices;
    const [cost] = item.costs;
    const selfPay = selfPayAmount(line, cost);
    if (!line || !selfPay) return `${item.name} has no current self-pay price`;

    const base = {
        selfPayPriceId: line.id, selfPayAmount: selfPay,
        agreementId: null, payerDiscountId: null, percent: null, itemCostId: null, packCost: null, unitsPerPack: null,
    };
    const withCost = (percent: Prisma.Decimal | null) => ({
        percent, itemCostId: cost!.id, packCost: cost!.packCost, unitsPerPack: cost!.unitsPerPack,
    });
    const selfPayPrice = (): ResolvedPrice => ({
        ...base, unitPrice: selfPay, basis: line.basis, source: 'SELF_PAY', itemPriceId: line.id,
        ...(line.basis === 'MARKUP' && withCost(line.percent)),
    });

    if (!payer) return selfPayPrice();
    if (payer.status !== 'ACTIVE') return `${payer.name} is inactive`;

    if (payerLine) {
        const fromLine = { ...base, basis: payerLine.basis, source: 'PAYER_LINE', itemPriceId: payerLine.id, agreementId: payerLine.agreementId };
        switch (payerLine.basis) {
            case 'DISCOUNT':
                return { ...fromLine, unitPrice: discounted(selfPay, payerLine.percent!), percent: payerLine.percent };
            case 'MARKUP':
                if (!cost) return `${item.name} has no current cost for ${payer.name}'s markup`;
                return { ...fromLine, unitPrice: markupPrice(cost.packCost, cost.unitsPerPack, payerLine.percent!), ...withCost(payerLine.percent) };
            default: // TARIFF, MANUAL
                return { ...fromLine, unitPrice: payerLine.amount! };
        }
    }

    if (discount) {
        return {
            ...base, unitPrice: discounted(selfPay, discount.percent), basis: 'DISCOUNT', source: 'PAYER_DISCOUNT',
            itemPriceId: line.id, payerDiscountId: discount.id, percent: discount.percent,
        };
    }
    return selfPayPrice();
}

/**
 * An item's self-pay charge price (13 §3), or why it can't be charged: inactive item or category,
 * or no self-pay price in effect (a MARKUP line with no cost included).
 */
export function selfPayChargePrice(item: PriceableItem): ChargePrice | string {
    if (item.status !== 'ACTIVE') return `${item.name} is inactive`;
    if (item.category.status !== 'ACTIVE') return `${item.name} is in an inactive category`;

    const [line] = item.prices;
    const [cost] = item.costs;
    const unitPrice = selfPayAmount(line, cost);
    if (!line || !unitPrice) return `${item.name} has no current self-pay price`;

    const markup = line.basis === 'MARKUP';
    return {
        billableItemId:  item.id,
        description:     item.name,
        category:        item.category.kind,
        unitPrice,
        basis:           line.basis,
        source:          'SELF_PAY',
        itemPriceId:     line.id,
        itemCostId:      markup ? cost.id : null,
        percent:         markup ? line.percent : null,
        agreementId:     null,
        payerDiscountId: null,
    };
}

/** A resolved price as shown: a markup's cost and percent reveal the margin, so they need billable.cost.view (§10). */
export function visiblePrice(price: ResolvedPrice, canSeeCost: boolean) {
    if (canSeeCost) return price;
    const { itemCostId, packCost, unitsPerPack, ...shown } = price;
    return { ...shown, percent: price.basis === 'MARKUP' ? null : price.percent };
}
