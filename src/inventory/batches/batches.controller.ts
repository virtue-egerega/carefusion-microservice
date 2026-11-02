import {
    Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { BatchQualityDto } from '@shared/contracts/inventory';
import { BatchQuality } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { BatchesService } from './batches.service';

/** Batches (PRD 15 §6, §14.3): created by posting goods receipts, never directly. */
@ApiTags('inventory')
@Controller('pharmacy/batches')
export class BatchesController {
    constructor(private readonly batchesService: BatchesService) {}

    @ApiOperation({
        summary: `Batches, soonest expiry first`,
        description: `Each with its product and the selling units it holds per pharmacy unit and status. \`count\` is the total matching the filters.`,
    })
    @ApiQuery({ name: 'itemId', required: false })
    @ApiQuery({ name: 'batchNumber', required: false, description: 'Part of the batch number, any case' })
    @ApiQuery({ name: 'qualityStatus', enum: BatchQuality, required: false })
    @ApiQuery({ name: 'expiresBefore', required: false, description: 'ISO date' })
    @ApiQuery({ name: 'withStock', required: false, type: Boolean, description: 'Only batches still holding stock' })
    @Authorize('pharmacy.stock.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('itemId', new ParseUUIDPipe({ optional: true })) itemId?: string,
        @Query('batchNumber') batchNumber?: string,
        @Query('qualityStatus', new ParseEnumPipe(BatchQuality, { optional: true })) qualityStatus?: BatchQuality,
        @Query('expiresBefore') expiresBefore?: string,
        @Query('withStock', new ParseBoolPipe({ optional: true })) withStock?: boolean,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.batchesService.findAll(orgId, {
            itemId,
            batchNumber:   batchNumber?.trim() || undefined,
            qualityStatus: qualityStatus as $Enums.BatchQuality | undefined,
            expiresBefore: expiresBefore ? new Date(expiresBefore) : undefined,
            withStock,
            limit,
            offset,
        });
    }

    @ApiOperation({
        summary: `A batch: where its stock is, the goods receipts that brought it in, its latest movements`,
        description: `Cost price per selling unit and value only with billable.cost.view.`,
    })
    @Authorize('pharmacy.stock.view')
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.batchesService.findOne(id, orgId, user.permissions);
    }

    @ApiOperation({
        summary: `Hold, release or recall a batch (PRD 15 §14.3)`,
        description: `Applies in every pharmacy unit at once. RECALLED needs \`recallReference\` and is final.`,
    })
    @Authorize('pharmacy.batch.quality')
    @HttpCode(200)
    @Post(':id/quality')
    changeQuality(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BatchQualityDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.batchesService.changeQuality(id, dto, orgId, user.sub);
    }
}
