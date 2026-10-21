import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';

type StatusGroup = { status: $Enums.CatalogStatus; _count: { _all: number } };

const totals = (groups: StatusGroup[]) => ({
    total:  groups.reduce((sum, g) => sum + g._count._all, 0),
    active: groups.find(g => g.status === $Enums.CatalogStatus.ACTIVE)?._count._all ?? 0,
});

/** Totals for the billables overview page. Counts only, in one transaction. */
@Injectable()
export class BillablesMetricsService {
    constructor(private readonly databaseService: DatabaseService) {}

    async overview(organizationId: string) {
        const client = this.databaseService.client;
        const now = new Date();
        // scheduled = starts in the future and not withdrawn (PRD 12 §6.3)
        const scheduled = { effectiveFrom: { gt: now }, cancelledAt: null };

        const [categories, items, upcomingPrices, upcomingDiscounts] = await client.$transaction([
            client.billableCategory.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true }, orderBy: { status: 'asc' } }),
            client.billableItem.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true }, orderBy: { status: 'asc' } }),
            client.itemPrice.count({ where: { ...scheduled, item: { organizationId } } }),
            client.payerDiscount.count({ where: { ...scheduled, payer: { organizationId } } }),
        ]);

        return {
            categories: totals(categories as StatusGroup[]),
            items:      totals(items as StatusGroup[]),
            upcomingPrices,
            upcomingDiscounts,
        };
    }
}
