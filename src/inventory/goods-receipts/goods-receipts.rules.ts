// Pure rules for PRD 15 §10–§11 (no DB access) — unit-tested in goods-receipts.rules.spec.ts.
import { Prisma } from '../../../generated/prisma/client';
import { sellingUnitCostPrice, toKobo } from '../../billables/pricing/pricing.rules';

/** "GRN-000123": the receipt number from its counter (SequenceCounter "grn:<orgId>"). */
export const goodsReceiptNumber = (n: number) => `GRN-${String(n).padStart(6, '0')}`;

/**
 * Why a receipt's supplier as given is refused, or null (§10.1): a delivery names its supplier, by id
 * or by name (not both); opening stock has none.
 */
export function goodsReceiptSupplierRefusal(type: string, given: { supplierId?: string; supplier?: unknown }): string | null {
    if (given.supplierId && given.supplier) return 'Give supplierId or supplier, not both';
    if (type === 'OPENING') return given.supplierId || given.supplier ? 'Opening stock has no supplier' : null;
    return given.supplierId || given.supplier ? null : 'A delivery needs its supplier: supplierId, or supplier: { name }';
}

/**
 * Why a new goods receipt item's product is refused, or null (§10.2): an existing product by
 * `stockItemId`, or a new one from `newProduct`, exactly one of the two.
 */
export function goodsReceiptItemProductRefusal(item: { stockItemId?: string; newProduct?: unknown }): string | null {
    if (!item.stockItemId === !item.newProduct) return 'Give the product: stockItemId for one on the system, or newProduct to add it';
    return null;
}

export type GoodsReceiptItemInput = {
    purchaseUnitsDelivered?: number;
    purchaseUnitsAccepted?:  number;
    rejectReason?:           string | null;
    updateCost?:             boolean;
    keepCostReason?:         string | null;
};

/**
 * Why a receipt item as entered is refused, or null (§10.1). Mirrors the GoodsReceiptItem CHECKs so a
 * draft is refused with a 400 naming the problem, instead of a constraint error.
 */
export function goodsReceiptItemRefusal(item: GoodsReceiptItemInput): string | null {
    const delivered = item.purchaseUnitsDelivered ?? 0;
    const accepted = item.purchaseUnitsAccepted ?? 0;
    if (accepted > delivered) return 'More purchase units accepted than delivered';
    if (accepted < delivered && !item.rejectReason) return 'Say why some purchase units were rejected (rejectReason)';
    if (item.updateCost === false && !item.keepCostReason) return "Say why this delivery shouldn't update the cost price (keepCostReason)";
    return null;
}

/** Selling units a receipt item adds to stock: only accepted purchase units count (§10.2). */
export const sellingUnitsAdded = (item: { purchaseUnitsAccepted: number; sellingUnitsPerPurchaseUnit: number }) =>
    item.purchaseUnitsAccepted * item.sellingUnitsPerPurchaseUnit;

const day = (date: Date | null | undefined) => date ? date.toISOString().slice(0, 10) : null;

export type PostingItem = {
    product:                     string;          // the product's name, for messages
    batchTracked:                boolean;
    productActive:               boolean;
    sellingUnitsPerPurchaseUnit: number;          // copied on the item
    productSellingUnitsPerPurchaseUnit: number;   // the product's now
    batchNumber:                 string | null;
    expiryDate:                  Date | null;
    manufacturedOn:              Date | null;
    pharmacyUnitOk:              boolean;         // active and in the receipt's branch
    existingBatch?:              { expiryDate: Date | null; manufacturedOn: Date | null } | null;
};

/**
 * Every reason the receipt can't be posted, item by item (§10.2), so one 400 lists them all. Empty
 * when it can. `receivedAt` is when the goods arrived: expired goods can't be accepted.
 */
export function postingProblems(items: PostingItem[], receivedAt: Date): string[] {
    const problems: string[] = [];
    if (!items.length) problems.push('The receipt has no items');

    // one lot has one expiry, on this receipt and against the batch already in stock
    const lots = new Map<string, string | null>();

    items.forEach((item, i) => {
        const name = `Item ${i + 1} (${item.product})`;
        if (!item.productActive) problems.push(`${name}: the product is inactive`);
        if (item.sellingUnitsPerPurchaseUnit !== item.productSellingUnitsPerPurchaseUnit) {
            problems.push(`${name}: the product now holds ${item.productSellingUnitsPerPurchaseUnit} selling units per purchase unit, not ${item.sellingUnitsPerPurchaseUnit}; save the item again`);
        }
        if (!item.pharmacyUnitOk) problems.push(`${name}: the pharmacy unit is inactive or in another branch`);
        if (item.batchTracked && (!item.batchNumber || !item.expiryDate)) problems.push(`${name}: needs its batch number and expiry`);
        if (item.expiryDate && day(item.expiryDate)! <= day(receivedAt)!) problems.push(`${name}: expired on arrival; reject it instead`);

        if (item.batchNumber) {
            const seen = lots.get(item.batchNumber);
            if (seen !== undefined && seen !== day(item.expiryDate)) problems.push(`${name}: lot ${item.batchNumber} has two expiry dates on this receipt`);
            lots.set(item.batchNumber, day(item.expiryDate));
            if (item.existingBatch && (day(item.existingBatch.expiryDate) !== day(item.expiryDate)
                || (item.manufacturedOn && day(item.existingBatch.manufacturedOn) !== day(item.manufacturedOn)))) {
                problems.push(`${name}: lot ${item.batchNumber} is already in stock with expiry ${day(item.existingBatch.expiryDate)}`);
            }
        }
    });
    return problems;
}

type Cost = { purchaseUnitCost: Prisma.Decimal | number | string; sellingUnitsPerPurchaseUnit: number };

/**
 * The cost price each product rolls to on posting (§11): the receipt's cost where `updateCost` is ticked
 * and the cost per selling unit differs from the one in effect (or there is none). Several ticked items
 * for one product must agree, else the posting is refused: `conflicts` names those products.
 */
export function costRolls<T extends Cost & { itemId: string; product: string; updateCost: boolean }>(
    items: T[], current: Map<string, Cost>,
): { rolls: Map<string, T>; conflicts: string[] } {
    const rolls = new Map<string, T>();
    const conflicts = new Set<string>();
    for (const item of items.filter(i => i.updateCost)) {
        const chosen = rolls.get(item.itemId);
        if (chosen) {
            if (!sellingUnitCostPrice(chosen).eq(sellingUnitCostPrice(item))) conflicts.add(item.product);
            continue;
        }
        rolls.set(item.itemId, item);
    }
    for (const [itemId, item] of rolls) {
        const now = current.get(itemId);
        if (now && sellingUnitCostPrice(now).eq(sellingUnitCostPrice(item))) rolls.delete(itemId);
    }
    return { rolls, conflicts: [...conflicts] };
}

export type PriceWarning = {
    itemId:               string;
    name:                 string;
    sellingUnit:          string;
    sellingUnitCostPrice: Prisma.Decimal;
    sellingUnitPrice:     Prisma.Decimal | null;   // null: no selling price yet
};

/**
 * The product's warning after posting (§11), or null: it has no self-pay price, or its MANUAL price
 * is now below the cost price of one selling unit. A MARKUP price follows the cost, so it never warns.
 */
export function priceWarning(
    product: { itemId: string; name: string; sellingUnit: string },
    cost: Cost | undefined,
    selfPay: { basis: string; sellingUnitPrice: Prisma.Decimal | null } | undefined,
): PriceWarning | null {
    if (!cost) return null;
    const costPrice = sellingUnitCostPrice(cost);
    const warning = { ...product, sellingUnitCostPrice: toKobo(costPrice) };
    if (!selfPay) return { ...warning, sellingUnitPrice: null };
    if (selfPay.basis === 'MANUAL' && selfPay.sellingUnitPrice && selfPay.sellingUnitPrice.lt(costPrice)) {
        return { ...warning, sellingUnitPrice: selfPay.sellingUnitPrice };
    }
    return null;
}

type Money = Prisma.Decimal | number | string;

/**
 * A goods receipt's totals (§10.4), worked out from its items, never stored: what the invoice lines add up
 * to (delivered), what entered stock (accepted), what was handed back (rejected), and how far the lines
 * are from the invoice's printed total, so a typo shows before posting. Each line is purchase units × the
 * cost of one, already whole kobo.
 */
export function goodsReceiptTotals(
    items: { purchaseUnitsDelivered: number; purchaseUnitsAccepted: number; purchaseUnitCost: Money }[],
    supplierInvoiceTotal: Money | null,
) {
    const zero = new Prisma.Decimal(0);
    const deliveredValue = items.reduce((sum, i) => sum.plus(new Prisma.Decimal(i.purchaseUnitCost).mul(i.purchaseUnitsDelivered)), zero);
    const acceptedValue = items.reduce((sum, i) => sum.plus(new Prisma.Decimal(i.purchaseUnitCost).mul(i.purchaseUnitsAccepted)), zero);
    const invoiceTotal = supplierInvoiceTotal === null ? null : new Prisma.Decimal(supplierInvoiceTotal);
    return {
        supplierInvoiceTotal: invoiceTotal,
        deliveredValue,
        acceptedValue,
        rejectedValue:        deliveredValue.minus(acceptedValue),
        invoiceDifference:    invoiceTotal && invoiceTotal.minus(deliveredValue),   // 0 when the lines match the invoice
    };
}
