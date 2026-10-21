import { Module } from '@nestjs/common';
import { BillableCategoriesController } from './categories/billable-categories.controller';
import { BillableCategoriesService } from './categories/billable-categories.service';
import { BillableItemsController } from './items/billable-items.controller';
import { BillableItemsService } from './items/billable-items.service';
import { BillablesMetricsController } from './metrics/billables-metrics.controller';
import { BillablesMetricsService } from './metrics/billables-metrics.service';

/**
 * What the hospital can bill for and what it costs each payer (PRD 12). Billing will import this
 * to price charges; it imports nothing from Billing, so the dependency only runs one way.
 */
@Module({
    controllers: [BillableCategoriesController, BillableItemsController, BillablesMetricsController],
    providers: [BillableCategoriesService, BillableItemsService, BillablesMetricsService],
})
export class BillablesModule {}
