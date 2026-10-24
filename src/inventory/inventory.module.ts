import { Module } from '@nestjs/common';
import { DrugsController } from './drugs/drugs.controller';
import { DrugsService } from './drugs/drugs.service';
import { StockItemsController } from './items/stock-items.controller';
import { StockItemsService } from './items/stock-items.service';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { ManufacturersService } from './suppliers/manufacturers.service';

/**
 * The hospital's stock of drugs and consumables (PRD 15). Dispensing will import this to take stock
 * out; it never charges, and nothing it imports depends on it.
 */
@Module({
    controllers: [DrugsController, StockItemsController, LocationsController, SuppliersController],
    providers:   [DrugsService, StockItemsService, LocationsService, SuppliersService, ManufacturersService],
})
export class InventoryModule {}
