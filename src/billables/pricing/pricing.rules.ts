// Pure pricing rules for PRD 12 §9 (no DB access) — unit-tested in pricing.rules.spec.ts.
import { Prisma } from '../../../generated/prisma/client';

type Money = Prisma.Decimal | number | string;

/** Rounds a worked-out price to whole kobo, half-up. Done once, as the last step (D12). */
export const toKobo = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

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
