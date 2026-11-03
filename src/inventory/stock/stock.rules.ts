// Pure rules for PRD 15 §8, §12, §14.3 (no DB access) — unit-tested in stock.rules.spec.ts.
import { Prisma } from '../../../generated/prisma/client';
import { roundUpToKobo } from '../../billables/pricing/pricing.rules';

type Money = Prisma.Decimal | number | string;

const day = (date: Date) => date.toISOString().slice(0, 10);

/** Expired from the day after its expiry date (§6.1); a batch with no expiry never expires. */
export const isExpired = (expiryDate: Date | null, today: Date) => !!expiryDate && day(expiryDate) < day(today);

export type UsableCheck = {
    status:        string;          // the balance's StockStatus
    qualityStatus: string;          // the batch's
    expiryDate:    Date | null;
    unitActive:    boolean;
    itemActive:    boolean;
};

/**
 * Why stock can't be taken out (issued, sent on, counted as available), or null when it's usable (§8.2):
 * available, from a released batch, not expired, in an active unit, of an active product.
 */
export function unusableReason(stock: UsableCheck, today: Date): string | null {
    if (stock.status === 'QUARANTINE') return 'it is in quarantine';
    if (stock.status !== 'AVAILABLE') return `it is ${stock.status.toLowerCase()}`;
    if (stock.qualityStatus === 'ON_HOLD') return 'the batch is on hold';
    if (stock.qualityStatus === 'RECALLED') return 'the batch is recalled';
    if (isExpired(stock.expiryDate, today)) return 'the batch is expired';
    if (!stock.unitActive) return 'the pharmacy unit is inactive';
    if (!stock.itemActive) return 'the product is inactive';
    return null;
}

type Offered = { batchId: string; expiryDate: Date | null; firstReceivedAt: Date };

/**
 * The FEFO order batches are offered in (§12.1): soonest expiry first, no expiry last, then first
 * received, then id. Presentation only: the pharmacy names the batch it took, the system never picks.
 */
export function fefoOrder<T extends Offered>(batches: T[]): T[] {
    return [...batches].sort((a, b) => {
        if (a.expiryDate && b.expiryDate && a.expiryDate.getTime() !== b.expiryDate.getTime()) return a.expiryDate.getTime() - b.expiryDate.getTime();
        if (!a.expiryDate !== !b.expiryDate) return a.expiryDate ? -1 : 1;
        if (a.firstReceivedAt.getTime() !== b.firstReceivedAt.getTime()) return a.firstReceivedAt.getTime() - b.firstReceivedAt.getTime();
        return a.batchId.localeCompare(b.batchId);
    });
}

/**
 * Why a quantity of selling units is refused, or null (§4): positive, and whole, or a half for a
 * product that is sellableInHalves. Never any other fraction.
 */
export function quantityRefusal(quantity: number, sellableInHalves: boolean): string | null {
    if (!(quantity > 0)) return 'The quantity must be more than zero';
    if (Number.isInteger(quantity)) return null;
    if (Number.isInteger(quantity * 2)) return sellableInHalves ? null : 'This product is counted in whole selling units only';
    return 'A quantity is whole selling units, or a half where the product allows it';
}

/** Status changes at one unit (§8.3), and the permission each needs. */
const STATUS_CHANGES: Record<string, { to: string[]; permission: string }> = {
    QUARANTINE: { to: ['AVAILABLE', 'DAMAGED'], permission: 'pharmacy.stock.status' },
    AVAILABLE:  { to: ['QUARANTINE', 'DAMAGED'], permission: 'pharmacy.stock.status' },
};

/**
 * Why a status change is refused, or null (§8.3). Releasing quarantine (QUARANTINE → AVAILABLE)
 * needs pharmacy.stock.release; the rest pharmacy.stock.status. DAMAGED stock leaves only by write-off.
 * `forbidden` marks a missing permission (403).
 */
export function statusChangeRefusal(from: string, to: string, permissions: string[]): { reason: string; forbidden?: true } | null {
    if (from === to) return { reason: `The stock is already ${to.toLowerCase()}` };
    const allowed = STATUS_CHANGES[from];
    if (!allowed || !allowed.to.includes(to)) return { reason: `Stock can't move from ${from} to ${to}` };
    const permission = from === 'QUARANTINE' && to === 'AVAILABLE' ? 'pharmacy.stock.release' : allowed.permission;
    if (!permissions.includes(permission)) return { reason: `Missing permission: ${permission}`, forbidden: true };
    return null;
}

/**
 * Why a batch quality change is refused, or null (§14.3): RELEASED ↔ ON_HOLD, either → RECALLED with
 * the recall reference. RECALLED is terminal: that stock leaves by write-off or supplier return.
 */
export function qualityChangeRefusal(current: string, next: string, recallReference?: string): string | null {
    if (current === 'RECALLED') return 'A recalled batch stays recalled; write the stock off or return it to the supplier';
    if (current === next) return `The batch is already ${next.toLowerCase().replace('_', ' ')}`;
    if (next === 'RECALLED' && !recallReference) return 'A recall needs its reference (recallReference)';
    return null;
}

/**
 * Why returning part of an issue is refused, or null (§12.3): each batch can take back at most what was
 * issued from it for that source, less what has already come back.
 */
export function returnRefusal(
    lines: { batchId: string; sellingUnitQuantity: number }[],
    issued: Map<string, number>,
    returned: Map<string, number>,
): string | null {
    if (lines.some(line => !(line.sellingUnitQuantity > 0))) return 'Each returned quantity must be more than zero';
    const asked = new Map<string, number>();
    for (const line of lines) asked.set(line.batchId, (asked.get(line.batchId) ?? 0) + line.sellingUnitQuantity);
    for (const [batchId, quantity] of asked) {
        const left = (issued.get(batchId) ?? 0) - (returned.get(batchId) ?? 0);
        if (quantity > left) return left > 0 ? `Only ${left} selling unit(s) of batch ${batchId} can still be returned` : `Nothing of batch ${batchId} was issued here to return`;
    }
    return null;
}

/**
 * A batch's cost price per selling unit from the goods receipt items that brought it in (§9.3): a
 * weighted average when one lot came in several deliveries. Unrounded; null if nothing was accepted.
 */
export function batchCostPrice(items: { purchaseUnitCost: Money; purchaseUnitsAccepted: number; sellingUnitsPerPurchaseUnit: number }[]): Prisma.Decimal | null {
    const units = items.reduce((sum, i) => sum + i.purchaseUnitsAccepted * i.sellingUnitsPerPurchaseUnit, 0);
    if (!units) return null;
    const paid = items.reduce((sum, i) => sum.plus(new Prisma.Decimal(i.purchaseUnitCost).mul(i.purchaseUnitsAccepted)), new Prisma.Decimal(0));
    return paid.div(units);
}

/** The value of a quantity at a batch's cost price, rounded up once (§9.3, D14). */
export const stockValue = (sellingUnits: Money, costPrice: Prisma.Decimal | null) =>
    costPrice ? roundUpToKobo(costPrice.mul(sellingUnits)) : null;

/** Which expiry group a batch is in today (§12.2): expired, within the window, or neither. */
export function expiryGroup(expiryDate: Date | null, today: Date, windowDays: number): 'EXPIRED' | 'EXPIRING' | null {
    if (!expiryDate) return null;
    if (isExpired(expiryDate, today)) return 'EXPIRED';
    const limit = new Date(today.getTime() + windowDays * 86_400_000);
    return day(expiryDate) <= day(limit) ? 'EXPIRING' : null;
}
