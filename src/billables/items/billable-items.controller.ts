import {
    Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateBillableItemDto, QuoteDto, UpdateBillableItemDto } from '@shared/contracts/billables';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { $Enums } from '../../../generated/prisma/client';
import { BillableItemsService } from './billable-items.service';
import { PricingService } from '../pricing/pricing.service';

@ApiTags('billables')
@Controller('billables')
export class BillableItemsController {
    constructor(
        private readonly itemsService: BillableItemsService,
        private readonly pricingService: PricingService,
    ) {}

    @ApiOperation({
        summary: 'Create a billable item with its self-pay price (PRD 12 §4.2)',
        description: 'The self-pay price takes effect immediately. MANUAL takes an `amount`; MARKUP takes a `percent` and the first `cost`, and also needs billable.cost.create. Returns `{ id, message }`.',
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

    // declared before `:id`, which would otherwise capture `items`
    @ApiOperation({
        summary: "The organisation's items by name, paginated, for search pickers",
        description: "`count` is the total matching the filters; `docs` is the page, each with its category " +
        "and `selfPayPrice` in effect now, and `price`: its current price for `payerId` (or self-pay) by PRD 12 §9.1, " +
        "or `price: null` with `priceError` if it can't be priced. 404 for an unknown payer, 400 for an inactive one. " +
        "`clinicId` keeps items linked to that clinic (PRD 12 §4.4). " +
        "Cost and markup percent are only returned to holders of billable.cost.view.",
    })
    @ApiQuery({ name: 'categoryId', required: false })
    @ApiQuery({ name: 'kind', enum: ServiceCategory, required: false })
    @ApiQuery({ name: 'clinicId', required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name or code, any case' })
    @ApiQuery({ name: 'payerId', required: false, description: 'Price each item for this payer; omitted = self-pay' })
    @Authorize('billable.view')
    @Get('items')
    findAll(
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
        @Query('categoryId', new ParseUUIDPipe({ optional: true })) categoryId?: string,
        @Query('kind', new ParseEnumPipe(ServiceCategory, { optional: true })) kind?: ServiceCategory,
        @Query('clinicId', new ParseUUIDPipe({ optional: true })) clinicId?: string,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('payerId', new ParseUUIDPipe({ optional: true })) payerId?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.itemsService.findAll(orgId, {
            payerId,
            categoryId,
            kind:   kind as $Enums.ServiceCategory | undefined,
            clinicId,
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

    @ApiOperation({
        summary: "The clinics an item is linked to, by name, paginated",
        description: '`count` is the total; `docs` is the page: `{ clinic: { id, name, isActive }, linkedAt }`.',
    })
    @Authorize('billable.view')
    @Get('items/:id/clinics')
    findClinics(
        @Param('id', ParseUUIDPipe) id: string,
        @OrganizationId() orgId: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.itemsService.findClinics(id, orgId, { limit, offset });
    }

    @ApiOperation({
        summary: "An item's price for a payer, or for self-pay (PRD 12 §9)",
        description: "Leave out `payerId` for the self-pay price. With a payer: the payer's line for the item, " +
        "else the payer's default discount off self-pay, else the self-pay price (`source` says which). " +
        "Priced at the server's current time. 400 if the item, its " +
        "category or the payer is inactive, or the item has no price. Cost and markup percent are only " +
        "returned to holders of billable.cost.view. Whether the payer covers the item is decided at charge time, not here.",
    })
    @ApiQuery({ name: 'payerId', required: false })
    @Authorize('billable.view')
    @Get('items/:id/quote')
    quote(
        @Param('id', ParseUUIDPipe) id: string,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
        @Query('payerId', new ParseUUIDPipe({ optional: true })) payerId?: string,
    ) {
        return this.pricingService.quote(orgId, id, payerId, user.permissions);
    }

    @ApiOperation({
        summary: 'Price a set of items for a payer, or for self-pay, with the total (PRD 12 §9.3)',
        description: "What the user is shown before charging. Omit `payerId` for self-pay. Each line is " +
        "`quantity × unitPrice` rounded to kobo, as the charge will be, and `total` adds them. 404 for an " +
        "unknown payer; 400 naming every item that can't be priced (inactive item, category or payer, no price). " +
        "Cost and markup percent are only returned to holders of billable.cost.view.",
    })
    @Authorize('billable.view')
    @Post('quote')
    @HttpCode(200)
    quoteTotal(@Body() dto: QuoteDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.pricingService.quoteTotal(orgId, dto.items, dto.payerId, user.permissions);
    }
}
