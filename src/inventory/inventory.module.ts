import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StockItemsController } from './items/stock-items.controller';
import { StockItemsService } from './items/stock-items.service';
import { PharmacyUnitsController } from './pharmacy-units/pharmacy-units.controller';
import { PharmacyUnitsService } from './pharmacy-units/pharmacy-units.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { ManufacturersService } from './suppliers/manufacturers.service';
import { GoodsReceiptsController } from './goods-receipts/goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts/goods-receipts.service';
import { StockController } from './stock/stock.controller';
import { StockService } from './stock/stock.service';
import { StockIssueService } from './stock/stock-issue.service';
import { BatchesController } from './batches/batches.controller';
import { BatchesService } from './batches/batches.service';

/**
 * The hospital's stock of drugs and consumables (PRD 15). Dispensing will import this to take stock
 * out; it never charges, and nothing it imports depends on it. Medicines live in MedicineManagementModule.
 */
@Module({
    imports:     [FilesModule],
    controllers: [StockItemsController, PharmacyUnitsController, SuppliersController, GoodsReceiptsController, StockController, BatchesController],
    providers:   [
        StockItemsService, PharmacyUnitsService, SuppliersService, ManufacturersService, GoodsReceiptsService, StockService, BatchesService,
        StockIssueService,
    ],
    // the issue contract (§12.3), for Dispensing
    exports:     [StockIssueService],
})
export class InventoryModule {}
