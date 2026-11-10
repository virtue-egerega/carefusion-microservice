import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { StatusChangeDto } from '@shared/contracts/inventory';
import { StockStatus, StockTransactionType } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { StockService } from './stock.service';

/** What stock there is, where, and how it moved (PRD 15 §8, §9, §12.2). */
@ApiTags('inventory')
@Controller('pharmacy')
export class StockController {
    constructor(private readonly stockService: StockService) {}

    @ApiOperation({
        summary: `One product's stock by pharmacy unit, batch and status`,
        description: `Usable rows first, soonest expiry first (FEFO): the batch to take out first. Unusable rows say why ` +
        `(quarantine, damaged, on hold, recalled, expired). \`count\` is the total matching the filters; \`docs\` is the page. ` +
        `\`sellingUnitCostPrice\` (the batch's cost price per selling unit, from the receipts that brought it in) ` +
        `and \`value\` only with billable.cost.view. Totals per status are on GET /pharmacy/items/:itemId.`,
    })
    @ApiQuery({ name: 'pharmacyUnitId', required: false })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'status', enum: StockStatus, required: false })
    @ApiQuery({ name: 'usable', required: false, type: Boolean, description: 'true: only usable rows; false: only unusable ones' })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the batch number, any case' })
    @Authorize('pharmacy.stock.view')
    @Get('items/:itemId/stock')
    itemStock(
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
        @Query('pharmacyUnitId', new ParseUUIDPipe({ optional: true })) pharmacyUnitId?: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('status', new ParseEnumPipe(StockStatus, { optional: true })) status?: StockStatus,
        @Query('usable', new ParseBoolPipe({ optional: true })) usable?: boolean,
        @Query('search') search?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.stockService.itemStock(itemId, orgId, {
            pharmacyUnitId, branchId,
            status: status as $Enums.StockStatus | undefined,
            usable,
            search: search?.trim() || undefined,
            limit, offset,
        }, user.permissions);
    }

    @ApiOperation({
        summary: `Expired and expiring stock (PRD 15 §12.2)`,
        description: `Batches with stock that are expired or expire within \`withinDays\` (default: the hospital's near-expiry window), ` +
        `soonest first, with quantities per pharmacy unit. \`value\` only with billable.cost.view.`,
    })
    @ApiQuery({ name: 'pharmacyUnitId', required: false })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'withinDays', required: false })
    @Authorize('pharmacy.stock.view')
    @Get('expiry')
    expiry(
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
        @Query('pharmacyUnitId', new ParseUUIDPipe({ optional: true })) pharmacyUnitId?: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('withinDays', new ParseIntPipe({ optional: true })) withinDays?: number,
    ) {
        return this.stockService.expiry(orgId, { pharmacyUnitId, branchId, withinDays }, user.permissions);
    }

    @ApiOperation({ summary: `The stock ledger, newest first`, description: `\`count\` is the total matching the filters; \`docs\` is the page.` })
    @ApiQuery({ name: 'itemId', required: false })
    @ApiQuery({ name: 'batchId', required: false })
    @ApiQuery({ name: 'pharmacyUnitId', required: false })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'type', enum: StockTransactionType, required: false })
    @ApiQuery({ name: 'from', required: false, description: 'ISO date, inclusive' })
    @ApiQuery({ name: 'to', required: false, description: 'ISO date, exclusive' })
    @Authorize('pharmacy.stock.view')
    @Get('movements')
    movements(
        @OrganizationId() orgId: string,
        @Query('itemId', new ParseUUIDPipe({ optional: true })) itemId?: string,
        @Query('batchId', new ParseUUIDPipe({ optional: true })) batchId?: string,
        @Query('pharmacyUnitId', new ParseUUIDPipe({ optional: true })) pharmacyUnitId?: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('type', new ParseEnumPipe(StockTransactionType, { optional: true })) type?: StockTransactionType,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.stockService.movements(orgId, {
            itemId, batchId, pharmacyUnitId, branchId,
            type: type as $Enums.StockTransactionType | undefined,
            from: from ? new Date(from) : undefined,
            to:   to ? new Date(to) : undefined,
            limit,
            offset,
        });
    }

    @ApiOperation({
        summary: `Change stock status at a pharmacy unit (PRD 15 §8.3)`,
        description: `Release from quarantine (needs pharmacy.stock.release), pull back to quarantine, or set aside as damaged. ` +
        `Each line names its batch. Returns \`{ id, message }\`; 409 if there isn't that much in that status.`,
    })
    @Authorize('pharmacy.stock.status')
    @Post('status-changes')
    changeStatus(@Body() dto: StatusChangeDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.stockService.changeStatus(dto, orgId, user.sub, user.permissions);
    }
}
