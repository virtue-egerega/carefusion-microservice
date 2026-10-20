import { Module } from '@nestjs/common';
import { BillableCategoriesController } from './categories/billable-categories.controller';
import { BillableCategoriesService } from './categories/billable-categories.service';

/**
 * What the hospital can bill for and what it costs each payer (PRD 12). Billing will import this
 * to price charges; it imports nothing from Billing, so the dependency only runs one way.
 */
@Module({
    controllers: [BillableCategoriesController],
    providers: [BillableCategoriesService],
})
export class BillablesModule {}
