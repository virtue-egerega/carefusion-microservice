import { Module } from '@nestjs/common';
import { BillableCategoriesController } from './categories/billable-categories.controller';
import { BillableCategoriesService } from './categories/billable-categories.service';
import { BillableItemsController } from './items/billable-items.controller';
import { BillableItemsService } from './items/billable-items.service';
import { BillablesMetricsController } from './metrics/billables-metrics.controller';
import { BillablesMetricsService } from './metrics/billables-metrics.service';
import { PricingService } from './pricing/pricing.service';
import { ItemUnitsController } from './item-units/item-units.controller';
import { ItemUnitsService } from './item-units/item-units.service';

/**
 * What the hospital can bill for and what it costs each payer (PRD 12). Billing will import this
 * to price charges; it imports nothing from Billing, so the dependency only runs one way.
 */
@Module({
    // BillableItemsController (at `billables`) has a bare `:id` route, so the controllers with fixed paths under
    // `billables/…` go first: Nest matches in registration order, and `:id` would otherwise capture `metrics`, `item-units`
    controllers: [BillableCategoriesController, BillablesMetricsController, ItemUnitsController, BillableItemsController],
    providers: [BillableCategoriesService, BillableItemsService, BillablesMetricsService, PricingService, ItemUnitsService],
    exports: [PricingService],
})
export class BillablesModule {}
