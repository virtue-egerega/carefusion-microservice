import { ConflictException } from '@nestjs/common';

// Taking more than a balance holds fails the StockBalance non-negative CHECK inside the movement trigger
// (15 §9.2): the database, not a read-then-write, is what stops an overdraw under concurrency.
const OVERDRAW = 'StockBalance_selling_unit_quantity_non_negative';

const isOverdraw = (e: unknown) => {
    const err = e as { message?: unknown; meta?: unknown; cause?: unknown };
    return [err?.message, JSON.stringify(err?.meta ?? {}), String(err?.cause ?? '')].some(text => String(text).includes(OVERDRAW));
};

/** Runs a stock write and turns an overdraw into a 409 with the given message. */
export async function withStockChecks<T>(fn: () => Promise<T>, insufficient = 'Not enough stock in that batch here'): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (isOverdraw(e)) throw new ConflictException(insufficient);
        throw e;
    }
}
