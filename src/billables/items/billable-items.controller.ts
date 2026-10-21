import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateBillableItemDto, UpdateBillableItemDto } from '@shared/contracts/billables';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { $Enums } from '../../../generated/prisma/client';
import { BillableItemsService } from './billable-items.service';

@ApiTags('billables')
@Controller('billables')
export class BillableItemsController {
    constructor(private readonly itemsService: BillableItemsService) {}

    @ApiOperation({
        summary: 'Create a billable item with its self-pay price (PRD 12 §4.2)',
        description: 'The self-pay price takes effect immediately. MANUAL takes an `amount`; MARKUP takes a `percent` and the first `cost`, and also needs billable.cost.create. Cost and markup percent are only returned to holders of billable.cost.view.',
    })
    @Authorize('billable.item.create', 'billable.price.create')
    @Post('categories/:categoryId/items')
    create(@Body() dto: CreateBillableItemDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.itemsService.create(dto, orgId, user.sub, user.permissions);
    }

    @ApiOperation({
        summary: "A category's items by name, paginated, with their current self-pay price",
        description: "`count` is the total matching the filters; `docs` is the page. " +
        "`selfPayPrice` is the price in effect now (null only if the item has no price: " +
        "a data error). Cost and markup percent are only returned to holders of billable.cost.view. ",
    })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name or code, any case' })
    @Authorize('billable.view')
    @Get('categories/:categoryId/items')
    findByCategory(
        @Param('categoryId', ParseUUIDPipe) categoryId: string,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.itemsService.findByCategory(categoryId, orgId, {
            status: status as $Enums.CatalogStatus | undefined,
            search: search?.trim() || undefined,
            limit,
            offset,
        }, user.permissions);
    }

    @ApiOperation({ summary: 'An item with its category and current self-pay price' })
    @Authorize('billable.view')
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.itemsService.findOne(id, orgId, user.permissions);
    }

    @ApiOperation({
        summary: 'Edit an item, move it to a category of the same kind, or deactivate it',
        description: 'Prices are not changed here; they have their own dated lines (PRD 12 §6).',
    })
    @Authorize('billable.item.update')
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateBillableItemDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.itemsService.update(id, dto, orgId, user.sub);
    }
}
