import { Module } from '@nestjs/common';
import { MedicinesController } from './medicines/medicines.controller';
import { MedicinesService } from './medicines/medicines.service';
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
    controllers: [MedicinesController, StockItemsController, LocationsController, SuppliersController],
    providers:   [MedicinesService, StockItemsService, LocationsService, SuppliersService, ManufacturersService],
})
export class InventoryModule {}
