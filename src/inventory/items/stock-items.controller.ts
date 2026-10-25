import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateItemPackDto, StockItemDto, UpdateItemPackDto } from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { $Enums } from '../../../generated/prisma/client';
import { StockItemsService } from './stock-items.service';

@ApiTags('inventory')
@Controller('pharmacy')
export class StockItemsController {
    constructor(private readonly stockItemsService: StockItemsService) {}

    @ApiOperation({
        summary: 'Make a billable item stocked, or update its stock settings (PRD 15 §3.2)',
        description: 'A PHARMACY item must name its medicine (a seeded medicine or the hospital\'s own); other kinds can\'t. ' +
        'Fields left out keep their value.',
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
        summary: 'Stocked items by name, paginated, with units held per status',
        description: '`count` is the total matching the filters; `docs` is the page. `stock` is `{ AVAILABLE, QUARANTINE, DAMAGED }` ' +
        'in base units, for `branchId` or `locationId` when given, else everywhere.',
    })
    @ApiQuery({ name: 'categoryId', required: false })
    @ApiQuery({ name: 'kind', enum: ServiceCategory, required: false })
    @ApiQuery({ name: 'medicineId', required: false, description: 'Every product of this medicine, whatever the brand or strength' })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false, description: "The billable item's status" })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, code, brand, generic name, alias or ingredient, any case' })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'locationId', required: false })
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
        @Query('locationId', new ParseUUIDPipe({ optional: true })) locationId?: string,
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
            locationId,
            limit,
            offset,
        });
    }

    @ApiOperation({ summary: 'A stocked item with its medicine, maker, packs and units held per status' })
    @Authorize('pharmacy.stock.view')
    @Get('items/:itemId')
    findOne(@Param('itemId', ParseUUIDPipe) itemId: string, @OrganizationId() orgId: string) {
        return this.stockItemsService.findOne(itemId, orgId);
    }

    @ApiOperation({
        summary: 'Add a pack: how the item is bought or handled, e.g. "Box of 100" (PRD 15 §4)',
        description: "Its size can't be edited later. A new default replaces the current one. Returns `{ id, message }`.",
    })
    @Authorize('pharmacy.item.manage')
    @Post('items/:itemId/packs')
    createPack(
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Body() dto: CreateItemPackDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.stockItemsService.createPack(itemId, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: "An item's packs: active first, then by size" })
    @Authorize('pharmacy.stock.view')
    @Get('items/:itemId/packs')
    findPacks(@Param('itemId', ParseUUIDPipe) itemId: string, @OrganizationId() orgId: string) {
        return this.stockItemsService.findPacks(itemId, orgId);
    }

    @ApiOperation({
        summary: 'Rename, re-barcode, (de)activate a pack or make it the default',
        description: "The size never changes: a new size is a new pack. Deactivating the default pack clears the default.",
    })
    @Authorize('pharmacy.item.manage')
    @Patch('packs/:id')
    updatePack(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateItemPackDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.stockItemsService.updatePack(id, dto, orgId, user.sub);
    }
}
