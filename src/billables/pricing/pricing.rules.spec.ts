import { Prisma } from '../../../generated/prisma/client';
import { markupPrice, selfPayAmount } from './pricing.rules';

const d = (v: number) => new Prisma.Decimal(v);

describe('markupPrice', () => {
    it('divides the pack cost and rounds once, at the end', () => {
        // 1,234.50 / 100 × 1.30 = 16.0485 → 16.05 (rounding the unit cost first would give 16.06)
        expect(markupPrice(1234.5, 100, 30).toFixed(2)).toBe('16.05');
    });

    it('prices a single unit pack', () => {
        expect(markupPrice(1000, 1, 30).toFixed(2)).toBe('1300.00');
    });

    it('rounds half a kobo up', () => {
        // 0.25 / 1 × 1.10 = 0.275 → 0.28
        expect(markupPrice('0.25', 1, 10).toFixed(2)).toBe('0.28');
    });

    it('sells at cost with a 0% markup', () => {
        expect(markupPrice(1500, 100, 0).toFixed(2)).toBe('15.00');
    });

    it('keeps exact decimals instead of floating point', () => {
        // 0.1 + 0.2 style errors would show here: 3 × 1.10 / 1 = 3.30 exactly
        expect(markupPrice('3.00', 1, '10').toFixed(2)).toBe('3.30');
    });
});

describe('selfPayAmount', () => {
    it('returns a MANUAL amount as it is', () => {
        expect(selfPayAmount({ basis: 'MANUAL', amount: d(4500), percent: null }, undefined)?.toFixed(2)).toBe('4500.00');
    });

    it('works out a MARKUP price from the cost in effect', () => {
        const line = { basis: 'MARKUP', amount: null, percent: d(30) };
        expect(selfPayAmount(line, { packCost: d(1234.5), unitsPerPack: 100 })?.toFixed(2)).toBe('16.05');
    });

    it("can't price a MARKUP line with no cost", () => {
        expect(selfPayAmount({ basis: 'MARKUP', amount: null, percent: d(30) }, undefined)).toBeNull();
    });

    it("can't price an item with no self-pay line", () => {
        expect(selfPayAmount(undefined, undefined)).toBeNull();
    });
});
