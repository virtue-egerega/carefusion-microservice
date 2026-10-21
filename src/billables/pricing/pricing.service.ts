import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { QuoteLineDto } from '@shared/contracts/billables';
import { Prisma } from '../../../generated/prisma/client';
import {
    ChargePrice, inEffectAt, lineAmount, resolvePrice, selfPayAndPayerLines, selfPayChargePrice, visiblePrice,
} from './pricing.rules';

/** A payer with its default discount in effect at `at`: what §9.1 needs besides the item. For Prisma `select`. */
export const payerForPricing = (at: Date) => ({
    id: true, name: true, status: true,
    discounts: { where: inEffectAt(at), take: 1, select: { id: true, percent: true } },
});

/** Prices items for charges (PRD 13 §3). Billing imports this; it reads only the catalog. */
@Injectable()
export class PricingService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Self-pay charge prices for the given items at `at`, keyed by item id, in one query. Fails with
     * one 400 listing every item that can't be charged, so callers can resolve before their transaction.
     */
    async selfPayPrices(organizationId: string, itemIds: string[], at: Date): Promise<Map<string, ChargePrice>> {
        const ids = [...new Set(itemIds)];
        if (!ids.length) return new Map();

        const items = await this.databaseService.client.billableItem.findMany({
            where:  { id: { in: ids }, organizationId },
            select: {
                id: true, name: true, status: true,
                category: { select: { kind: true, status: true } },
                // at most one of each is in effect at a time (exclusion constraints)
                prices: { where: { payerId: null, ...inEffectAt(at) }, take: 1, select: { id: true, basis: true, amount: true, percent: true } },
                costs:  { where: inEffectAt(at), take: 1, select: { id: true, packCost: true, unitsPerPack: true } },
            },
        });

        const prices = new Map<string, ChargePrice>();
        const problems: string[] = [];
        for (const id of ids) {
            const item = items.find(i => i.id === id);
            const price = item ? selfPayChargePrice(item) : `Billable item ${id} not found`;
            if (typeof price === 'string') problems.push(price);
            else prices.set(id, price);
        }
        if (problems.length) throw new BadRequestException(`Can't charge: ${problems.join('; ')}`);
        return prices;
    }

    /**
     * What an item costs now for a payer, or for self-pay with no payer (PRD 12 §9). A markup's
     * cost and percent reveal the margin, so they need billable.cost.view (§10).
     */
    async quote(organizationId: string, itemId: string, payerId: string | undefined, permissions: string[]) {
        const at = new Date();
        const { items: [item], payer, priceOf } = await this.loadForPricing(organizationId, [itemId], payerId, at);
        if (!item) throw new NotFoundException('Billable item not found');

        const price = priceOf(item);
        if (typeof price === 'string') throw new BadRequestException(price);

        return {
            item:  { id: item.id, name: item.name, kind: item.category.kind },
            payer: payer && { id: payer.id, name: payer.name },
            at,
            ...visiblePrice(price, permissions.includes('billable.cost.view')),
        };
    }

    /**
     * The priced lines and total for a set of items, for a payer or self-pay (§9.3): what the user is
     * shown before charging. Each line is rounded as the charge rounds it, so the totals match. Fails
     * with one 400 naming every item that can't be priced.
     */
    async quoteTotal(organizationId: string, lines: QuoteLineDto[], payerId: string | undefined, permissions: string[]) {
        const at = new Date();
        const { items, payer, priceOf } = await this.loadForPricing(organizationId, lines.map(line => line.billableItemId), payerId, at);
        const canSeeCost = permissions.includes('billable.cost.view');

        const problems: string[] = [];
        const priced = lines.flatMap(({ billableItemId, quantity = 1 }) => {
            const item = items.find(i => i.id === billableItemId);
            const price = item ? priceOf(item) : `Billable item ${billableItemId} not found`;
            if (typeof price === 'string') {
                problems.push(price);
                return [];
            }
            return [{
                item:   { id: item!.id, name: item!.name, kind: item!.category.kind },
                quantity,
                amount: lineAmount(price.unitPrice, quantity),
                ...visiblePrice(price, canSeeCost),
            }];
        });
        if (problems.length) throw new BadRequestException(`Can't price: ${[...new Set(problems)].join('; ')}`);

        return {
            payer: payer && { id: payer.id, name: payer.name },
            at,
            lines: priced,
            total: priced.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0)),
        };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * The items with their self-pay and payer lines and cost at `at`, and the payer with its default
     * discount, in one round trip; plus `priceOf`, which applies §9.1 to one of the items. 404 for an
     * unknown payer. Unknown items are simply missing from `items`.
     */
    private async loadForPricing(organizationId: string, itemIds: string[], payerId: string | undefined, at: Date) {
        const client = this.databaseService.client;
        const [items, payer] = await client.$transaction([
            client.billableItem.findMany({
                where:  { id: { in: [...new Set(itemIds)] }, organizationId },
                select: {
                    id: true, name: true, status: true,
                    category: { select: { kind: true, status: true } },
                    prices: {
                        where:  selfPayAndPayerLines(payerId, at),
                        select: { id: true, payerId: true, basis: true, amount: true, percent: true, agreementId: true },
                    },
                    costs: { where: inEffectAt(at), take: 1, select: { id: true, packCost: true, unitsPerPack: true } },
                },
            }),
            client.payer.findFirst({ where: { id: payerId ?? '', organizationId }, select: payerForPricing(at) }),
        ]);
        if (payerId && !payer) throw new NotFoundException('Payer not found');

        const priceOf = (item: (typeof items)[number]) => resolvePrice({
            item:      { ...item, prices: item.prices.filter(line => line.payerId === null) },
            payer:     payer ?? undefined,
            payerLine: item.prices.find(line => line.payerId !== null),
            discount:  payer?.discounts[0],
        });
        return { items, payer, priceOf };
    }
}
