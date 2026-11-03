import { Prisma } from '../../../generated/prisma/client';
import {
    belowCostWarning, discounted, lineAmount, markupPrice, resolvePrice, roundUpToKobo, selfPayAmount, selfPayChargePrice, sellingUnitCostPrice, visiblePrice,
} from './pricing.rules';

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
    it('returns a MANUAL selling unit price as it is', () => {
        expect(selfPayAmount({ basis: 'MANUAL', sellingUnitPrice: d(4500), percent: null }, undefined)?.toFixed(2)).toBe('4500.00');
    });

    it('works out a MARKUP price from the cost in effect', () => {
        const line = { basis: 'MARKUP', sellingUnitPrice: null, percent: d(30) };
        expect(selfPayAmount(line, { purchaseUnitCost: d(1234.5), sellingUnitsPerPurchaseUnit: 100 })?.toFixed(2)).toBe('16.05');
    });

    it("can't price a MARKUP line with no cost", () => {
        expect(selfPayAmount({ basis: 'MARKUP', sellingUnitPrice: null, percent: d(30) }, undefined)).toBeNull();
    });

    it("can't price an item with no self-pay line", () => {
        expect(selfPayAmount(undefined, undefined)).toBeNull();
    });
});

describe('selfPayChargePrice', () => {
    const item = (over: Partial<Parameters<typeof selfPayChargePrice>[0]> = {}) => ({
        id: 'item-1', name: 'Full Blood Count', status: 'ACTIVE',
        category: { kind: 'LABORATORY', status: 'ACTIVE' },
        sellingPrices: [{ id: 'line-1', basis: 'MANUAL', sellingUnitPrice: d(4500), percent: null }],
        costPrices: [],
        ...over,
    });

    it('prices a MANUAL item from its self-pay line, recording the line', () => {
        const price = selfPayChargePrice(item());
        expect(typeof price).toBe('object');
        if (typeof price === 'string') return;
        expect(price.unitPrice.toFixed(2)).toBe('4500.00');
        expect(price).toMatchObject({
            billableItemId: 'item-1', description: 'Full Blood Count', category: 'LABORATORY',
            basis: 'MANUAL', source: 'SELF_PAY', itemSellingPriceId: 'line-1', itemCostPriceId: null, percent: null,
        });
    });

    it('prices a MARKUP item from the cost in effect, recording the cost and percent', () => {
        const price = selfPayChargePrice(item({
            sellingPrices: [{ id: 'line-2', basis: 'MARKUP', sellingUnitPrice: null, percent: d(30) }],
            costPrices:  [{ id: 'cost-1', purchaseUnitCost: d(1234.5), sellingUnitsPerPurchaseUnit: 100 }],
        }));
        if (typeof price === 'string') throw new Error(price);
        expect(price.unitPrice.toFixed(2)).toBe('16.05');
        expect(price.itemCostPriceId).toBe('cost-1');
        expect(price.percent?.toFixed(2)).toBe('30.00');
    });

    it('charges a free item at 0', () => {
        const price = selfPayChargePrice(item({ sellingPrices: [{ id: 'line-3', basis: 'MANUAL', sellingUnitPrice: d(0), percent: null }] }));
        if (typeof price === 'string') throw new Error(price);
        expect(price.unitPrice.toFixed(2)).toBe('0.00');
    });

    it('refuses an inactive item or category', () => {
        expect(selfPayChargePrice(item({ status: 'INACTIVE' }))).toBe('Full Blood Count is inactive');
        expect(selfPayChargePrice(item({ category: { kind: 'LABORATORY', status: 'INACTIVE' } }))).toBe('Full Blood Count is in an inactive category');
    });

    it('refuses an item with no current price, including MARKUP with no cost', () => {
        expect(selfPayChargePrice(item({ sellingPrices: [] }))).toBe('Full Blood Count has no current self-pay price');
        expect(selfPayChargePrice(item({ sellingPrices: [{ id: 'l', basis: 'MARKUP', sellingUnitPrice: null, percent: d(30) }], costPrices: [] })))
            .toBe('Full Blood Count has no current self-pay price');
    });
});

describe('discounted', () => {
    it('takes the percent off and rounds once, half-up', () => {
        // 20,000 × 0.875 = 17,500; 4,500.50 × 0.9 = 4,050.45; 0.25 × 0.5 = 0.125 → 0.13
        expect(discounted(d(20000), '12.5').toFixed(2)).toBe('17500.00');
        expect(discounted(d(4500.5), 10).toFixed(2)).toBe('4050.45');
        expect(discounted(d(0.25), 50).toFixed(2)).toBe('0.13');
    });
});

describe('resolvePrice', () => {
    const consultation = (over: Partial<Parameters<typeof resolvePrice>[0]['item']> = {}) => ({
        id: 'item-1', name: 'GP Consultation', status: 'ACTIVE',
        category: { kind: 'CONSULTATION', status: 'ACTIVE' },
        sellingPrices: [{ id: 'self-1', basis: 'MANUAL', sellingUnitPrice: d(20000), percent: null }],
        costPrices: [],
        ...over,
    });
    const hygeia = { name: 'Hygeia', status: 'ACTIVE' };
    const ok = (result: ReturnType<typeof resolvePrice>) => {
        if (typeof result === 'string') throw new Error(result);
        return result;
    };

    it('prices self-pay with no payer', () => {
        const price = ok(resolvePrice({ item: consultation() }));
        expect(price.unitPrice.toFixed(2)).toBe('20000.00');
        expect(price).toMatchObject({ source: 'SELF_PAY', basis: 'MANUAL', itemSellingPriceId: 'self-1', selfPayPriceId: 'self-1' });
    });

    it("uses the payer's tariff line, recording its agreement", () => {
        const price = ok(resolvePrice({
            item: consultation(), payer: hygeia,
            payerLine: { id: 'hyg-1', basis: 'TARIFF', sellingUnitPrice: d(15000), percent: null, agreementId: 'agr-1' },
            discount: { id: 'disc-1', percent: d(10) },
        }));
        expect(price.unitPrice.toFixed(2)).toBe('15000.00');
        expect(price.selfPayAmount.toFixed(2)).toBe('20000.00');
        expect(price).toMatchObject({ source: 'PAYER_LINE', basis: 'TARIFF', itemSellingPriceId: 'hyg-1', agreementId: 'agr-1', payerDiscountId: null });
    });

    it("takes a payer DISCOUNT line off the self-pay price", () => {
        const price = ok(resolvePrice({
            item: consultation(), payer: hygeia,
            payerLine: { id: 'hyg-2', basis: 'DISCOUNT', sellingUnitPrice: null, percent: d(15), agreementId: null },
        }));
        expect(price.unitPrice.toFixed(2)).toBe('17000.00');
        expect(price.percent?.toFixed(2)).toBe('15.00');
    });

    it("prices a payer MARKUP line on the cost, and refuses it with no cost", () => {
        const line = { id: 'hyg-3', basis: 'MARKUP', sellingUnitPrice: null, percent: d(20), agreementId: null };
        const drug = consultation({
            sellingPrices: [{ id: 'self-2', basis: 'MARKUP', sellingUnitPrice: null, percent: d(30) }],
            costPrices:  [{ id: 'cost-1', purchaseUnitCost: d(1000), sellingUnitsPerPurchaseUnit: 10 }],
        });
        const price = ok(resolvePrice({ item: drug, payer: hygeia, payerLine: line }));
        expect(price.unitPrice.toFixed(2)).toBe('120.00');
        expect(price.selfPayAmount.toFixed(2)).toBe('130.00');
        expect(price).toMatchObject({ itemCostPriceId: 'cost-1', sellingUnitsPerPurchaseUnit: 10 });

        expect(resolvePrice({ item: consultation(), payer: hygeia, payerLine: line }))
            .toBe("GP Consultation has no current cost for Hygeia's markup");
    });

    it("falls back to the payer's default discount, priced off self-pay", () => {
        const price = ok(resolvePrice({ item: consultation(), payer: hygeia, discount: { id: 'disc-1', percent: d(10) } }));
        expect(price.unitPrice.toFixed(2)).toBe('18000.00');
        expect(price).toMatchObject({ source: 'PAYER_DISCOUNT', basis: 'DISCOUNT', payerDiscountId: 'disc-1', itemSellingPriceId: 'self-1' });
    });

    it('charges a payer with neither the self-pay price', () => {
        const price = ok(resolvePrice({ item: consultation(), payer: hygeia }));
        expect(price.unitPrice.toFixed(2)).toBe('20000.00');
        expect(price.source).toBe('SELF_PAY');
    });

    it('refuses an inactive payer, item or category, or an item with no price', () => {
        expect(resolvePrice({ item: consultation(), payer: { name: 'Hygeia', status: 'INACTIVE' } })).toBe('Hygeia is inactive');
        expect(resolvePrice({ item: consultation({ status: 'INACTIVE' }) })).toBe('GP Consultation is inactive');
        expect(resolvePrice({ item: consultation({ category: { kind: 'CONSULTATION', status: 'INACTIVE' } }) }))
            .toBe('GP Consultation is in an inactive category');
        expect(resolvePrice({ item: consultation({ sellingPrices: [] }) })).toBe('GP Consultation has no current self-pay price');
    });
});

describe('visiblePrice', () => {
    const markup = resolvePrice({
        item: {
            id: 'item-1', name: 'Paracetamol 500mg', status: 'ACTIVE',
            category: { kind: 'PHARMACY', status: 'ACTIVE' },
            sellingPrices: [{ id: 'self-1', basis: 'MARKUP', sellingUnitPrice: null, percent: d(30) }],
            costPrices:  [{ id: 'cost-1', purchaseUnitCost: d(1000), sellingUnitsPerPurchaseUnit: 100 }],
        },
    });
    if (typeof markup === 'string') throw new Error(markup);

    it("hides a markup's cost and percent without billable.cost.view", () => {
        const shown = visiblePrice(markup, false);
        expect(shown.unitPrice.toFixed(2)).toBe('13.00');
        expect(shown.percent).toBeNull();
        expect(shown).not.toHaveProperty('purchaseUnitCost');
        expect(shown).not.toHaveProperty('itemCostPriceId');
    });

    it('shows everything with billable.cost.view', () => {
        expect(visiblePrice(markup, true)).toMatchObject({ itemCostPriceId: 'cost-1', sellingUnitsPerPurchaseUnit: 100 });
    });

    it("keeps a discount's percent: it isn't a margin", () => {
        const price = resolvePrice({
            item: {
                id: 'item-2', name: 'GP Consultation', status: 'ACTIVE',
                category: { kind: 'CONSULTATION', status: 'ACTIVE' },
                sellingPrices: [{ id: 'self-2', basis: 'MANUAL', sellingUnitPrice: d(20000), percent: null }],
                costPrices: [],
            },
            payer: { name: 'Hygeia', status: 'ACTIVE' },
            discount: { id: 'disc-1', percent: d(10) },
        });
        if (typeof price === 'string') throw new Error(price);
        expect(visiblePrice(price, false).percent?.toFixed(2)).toBe('10.00');
    });
});

describe('lineAmount', () => {
    it('multiplies by the quantity and rounds once, half-up', () => {
        // 16.05 × 2.5 = 40.125 → 40.13; 4,500 × 1 = 4,500
        expect(lineAmount(d(16.05), '2.5').toFixed(2)).toBe('40.13');
        expect(lineAmount(d(4500), 1).toFixed(2)).toBe('4500.00');
    });
});

describe('sellingUnitCostPrice', () => {
    it('divides the purchase unit cost by its selling units, unrounded', () => {
        // a carton of 24 bottles at ₦50,000.00
        expect(sellingUnitCostPrice({ purchaseUnitCost: d(50000), sellingUnitsPerPurchaseUnit: 24 }).toFixed(4)).toBe('2083.3333');
    });
});

describe('roundUpToKobo', () => {
    it('rounds a cost up to the kobo, never down', () => {
        expect(roundUpToKobo(d(100000).div(3)).toFixed(2)).toBe('33333.34');
        expect(roundUpToKobo(d(2500000).div(1200)).toFixed(2)).toBe('2083.34');
    });

    it('leaves a whole-kobo amount as it is', () => {
        expect(roundUpToKobo(d(2500000).div(50)).toFixed(2)).toBe('50000.00');
        expect(roundUpToKobo(d(10).div(10)).toFixed(2)).toBe('1.00');
    });
});

describe('belowCostWarning', () => {
    const CARTON = { purchaseUnitCost: d(50000), sellingUnitsPerPurchaseUnit: 24 };

    it('warns when the selling price is under the cost price of one selling unit', () => {
        expect(belowCostWarning(2000, CARTON, 'bottle')).toBe('Selling price ₦2,000.00 is below the cost price ₦2,083.34 per bottle');
    });

    it('compares against the exact cost, not the rounded one', () => {
        // ₦2,083.33 is still a third of a kobo under ₦50,000 / 24
        expect(belowCostWarning(2083.33, CARTON, 'bottle')).not.toBeNull();
        expect(belowCostWarning(2083.34, CARTON, 'bottle')).toBeNull();
    });

    it('says nothing when the price covers the cost, or there is no cost yet', () => {
        expect(belowCostWarning(2500, CARTON, 'bottle')).toBeNull();
        expect(belowCostWarning(2500, undefined, 'bottle')).toBeNull();
    });
});
