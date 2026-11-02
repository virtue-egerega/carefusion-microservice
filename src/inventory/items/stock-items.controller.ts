import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateStockedProductDto, StockItemDto } from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { $Enums } from '../../../generated/prisma/client';
import { StockItemsService } from './stock-items.service';

@ApiTags('inventory')
@Controller('pharmacy')
export class StockItemsController {
    constructor(private readonly stockItemsService: StockItemsService) {}

    @ApiOperation({
        summary: `Add a product: what the pharmacy stocks, its selling unit and purchase unit (PRD 15 §3.3)`,
        description: `Creates the billable item and its stock settings together. \`categoryId\`, or \`category: { name }\` to find ` +
        `or create one (PHARMACY for a drug, else CONSUMABLE); \`manufacturerId\`, or \`manufacturer: { name }\` likewise. ` +
        `A first self-pay price per selling unit is optional (\`sellingUnitPrice\` + \`reason\`, needs billable.price.create); ` +
        `without one the product can't be charged yet. Returns \`{ id, message }\`.`,
    })
    @Authorize('pharmacy.item.manage')
    @Post('items')
    create(@Body() dto: CreateStockedProductDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.stockItemsService.create(dto, orgId, user.sub, user.permissions);
    }

    @ApiOperation({
        summary: `Make an existing billable item stocked, or update its stock settings (PRD 15 §3.2)`,
        description: `A PHARMACY item must name its medicine (a seeded medicine or the hospital's own); other kinds can't. ` +
        `purchaseUnitName and sellingUnitsPerPurchaseUnit are required when first stocked; the units are fixed once it has stock. ` +
        `Fields left out keep their value.`,
    })
    @Authorize('pharmacy.item.manage')
    @Put('items/:itemId')
    upsert(
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Body() dto: StockItemDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.stockItemsService.upsert(itemId, dto, orgId, user.sub);
    }

    @ApiOperation({
        summary: `Stocked items by name, paginated, with units held per status`,
        description: `\`count\` is the total matching the filters; \`docs\` is the page. \`stock\` is \`{ AVAILABLE, QUARANTINE, DAMAGED }\` ` +
        `in selling units, for \`branchId\` or \`pharmacyUnitId\` when given, else everywhere.`,
    })
    @ApiQuery({ name: 'categoryId', required: false })
    @ApiQuery({ name: 'kind', enum: ServiceCategory, required: false })
    @ApiQuery({ name: 'medicineId', required: false, description: 'Every product of this medicine, whatever the brand or strength' })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false, description: "The billable item's status" })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, code, brand, generic name, alias or ingredient, any case' })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'pharmacyUnitId', required: false })
    @Authorize('pharmacy.stock.view')
    @Get('items')
    findAll(
        @OrganizationId() orgId: string,
        @Query('categoryId', new ParseUUIDPipe({ optional: true })) categoryId?: string,
        @Query('kind', new ParseEnumPipe(ServiceCategory, { optional: true })) kind?: ServiceCategory,
        @Query('medicineId', new ParseUUIDPipe({ optional: true })) medicineId?: string,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('pharmacyUnitId', new ParseUUIDPipe({ optional: true })) pharmacyUnitId?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.stockItemsService.findAll(orgId, {
            categoryId,
            kind:   kind as $Enums.ServiceCategory | undefined,
            medicineId,
            status: status as $Enums.CatalogStatus | undefined,
            search: search?.trim() || undefined,
            branchId,
            pharmacyUnitId,
            limit,
            offset,
        });
    }

    @ApiOperation({ summary: `A stocked product with its medicine, maker, units and selling units held per status` })
    @Authorize('pharmacy.stock.view')
    @Get('items/:itemId')
    findOne(@Param('itemId', ParseUUIDPipe) itemId: string, @OrganizationId() orgId: string) {
        return this.stockItemsService.findOne(itemId, orgId);
    }
}
