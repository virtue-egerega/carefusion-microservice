import {
    Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import {
    AttachGoodsReceiptFilesDto, CancelGoodsReceiptDto, CreateGoodsReceiptDto, GoodsReceiptItemDto, UpdateGoodsReceiptDto,
    UpdateGoodsReceiptItemDto,
} from '@shared/contracts/inventory';
import { ReceiptStatus, ReceiptType } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { GoodsReceiptsService } from './goods-receipts.service';

/** Goods receipts (PRD 15 §10): record a delivery, add its items one by one, attach the invoice, post it into stock. */
@ApiTags('inventory')
@Controller('pharmacy')
export class GoodsReceiptsController {
    constructor(private readonly goodsReceiptsService: GoodsReceiptsService) {}

    @ApiOperation({
        summary: `Draft a goods receipt: the invoice header (PRD 15 §10.2)`,
        description: `A DELIVERY names its supplier: \`supplierId\`, or \`supplier: { name }\` to find or create it. \`pharmacyUnitId\` defaults to ` +
        `your branch's store. Invoice photos: upload them to POST /files first and pass their ids as \`attachmentFileIds\` ` +
        `(one or more). Changes no stock. Returns \`{ id, number, message }\`.`,
    })
    @Authorize('pharmacy.receipt.create')
    @Post('goods-receipts')
    create(@Body() dto: CreateGoodsReceiptDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.goodsReceiptsService.create(dto, orgId, user.branchId, user.sub);
    }

    // declared before `goods-receipts/:id`, which would otherwise capture `metrics`
    @ApiOperation({
        summary: `Goods receipt counts: total, per status and per type`,
        description: `\`{ total, byStatus: { DRAFT, POSTED, CANCELLED }, byType: { DELIVERY, OPENING } }\`, zero where there are none. ` +
        `DRAFT receipts are waiting to be posted. Same filters as the list, plus \`pharmacyUnitId\` and \`branchId\`.`,
    })
    @ApiQuery({ name: 'supplierId', required: false })
    @ApiQuery({ name: 'pharmacyUnitId', required: false })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'from', required: false, description: 'Received on or after (ISO date)' })
    @ApiQuery({ name: 'to', required: false, description: 'Received before (ISO date)' })
    @Authorize('pharmacy.stock.view')
    @Get('goods-receipts/metrics')
    metrics(
        @OrganizationId() orgId: string,
        @Query('supplierId', new ParseUUIDPipe({ optional: true })) supplierId?: string,
        @Query('pharmacyUnitId', new ParseUUIDPipe({ optional: true })) pharmacyUnitId?: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.goodsReceiptsService.metrics(orgId, {
            supplierId, pharmacyUnitId, branchId,
            from: from ? new Date(from) : undefined,
            to:   to ? new Date(to) : undefined,
        });
    }

    @ApiOperation({
        summary: `Goods receipts, newest arrivals first`,
        description: `\`count\` is the total matching the filters; \`docs\` is the page. Each has its \`supplier\`, \`supplierInvoiceNo\`, ` +
        `\`goodsReceiptItemCount\`, \`attachmentCount\`, \`closestExpiryDate\` (the soonest expiry across its items), \`createdBy\` and ` +
        `\`postedBy\` (who drafted and who posted, i.e. approved, it: \`{ id, firstName, lastName }\`), and \`supplierInvoiceTotal\` ` +
        `for whoever can see receipt costs. The worked-out totals are on the receipt's detail.`,
    })
    @ApiQuery({ name: 'status', enum: ReceiptStatus, required: false })
    @ApiQuery({ name: 'type', enum: ReceiptType, required: false })
    @ApiQuery({ name: 'supplierId', required: false })
    @ApiQuery({ name: 'from', required: false, description: 'Received on or after (ISO date)' })
    @ApiQuery({ name: 'to', required: false, description: 'Received before (ISO date)' })
    @Authorize('pharmacy.stock.view')
    @Get('goods-receipts')
    findAll(
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
        @Query('status', new ParseEnumPipe(ReceiptStatus, { optional: true })) status?: ReceiptStatus,
        @Query('type', new ParseEnumPipe(ReceiptType, { optional: true })) type?: ReceiptType,
        @Query('supplierId', new ParseUUIDPipe({ optional: true })) supplierId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.goodsReceiptsService.findAll(orgId, {
            status: status as $Enums.ReceiptStatus | undefined,
            type:   type as $Enums.ReceiptType | undefined,
            supplierId,
            from:   from ? new Date(from) : undefined,
            to:     to ? new Date(to) : undefined,
            limit,
            offset,
        }, user.permissions);
    }

    @ApiOperation({
        summary: `A goods receipt with its items, invoice photos and totals`,
        description: `Every person on it is \`{ id, firstName, lastName }\` (null when unset): \`createdBy\`, \`updatedBy\`, \`postedBy\` ` +
        `(who approved it), \`cancelledBy\`, and each attachment's \`attachedBy\`.`,
    })
    @Authorize('pharmacy.stock.view')
    @Get('goods-receipts/:id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.goodsReceiptsService.findOne(id, orgId, user.permissions);
    }

    @ApiOperation({ summary: `Edit a draft receipt's header`, description: `A supplier given by name is found or created.` })
    @Authorize('pharmacy.receipt.create')
    @Patch('goods-receipts/:id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGoodsReceiptDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.goodsReceiptsService.update(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: `Cancel a draft receipt`, description: `A posted receipt is never cancelled; corrections are adjustments.` })
    @Authorize('pharmacy.receipt.create')
    @HttpCode(200)
    @Post('goods-receipts/:id/cancel')
    cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelGoodsReceiptDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.goodsReceiptsService.cancel(id, dto.reason, orgId, user.sub);
    }

    

    // ── posting ──────────────────────────────────────────────────────────────

    @ApiOperation({
        summary: `Post a receipt into stock (PRD 15 §10.2)`,
        description: `Creates the batches, adds accepted purchase units × selling units per purchase unit to stock and rolls cost prices ` +
        `forward. Each item with rejected purchase units becomes a supplier credit claim: what the supplier owes for goods paid for ` +
        `and handed back. 400 lists every problem. Returns \`{ id, message, priceWarnings }\`: products now selling below their cost price per ` +
        `selling unit, or with no selling price yet.`,
    })
    @Authorize('pharmacy.receipt.post')
    @HttpCode(200)
    @Post('goods-receipts/:id/post')
    post(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.goodsReceiptsService.post(id, orgId, user.sub);
    }

    // ── invoice photos ───────────────────────────────────────────────────────

    @ApiOperation({
        summary: `Attach more invoice photos or scans to a goods receipt`,
        description: `Ids from POST /files, one or more; draft or posted receipts. A file already attached is skipped. Returns \`{ count, message }\`.`,
    })
    @Authorize('pharmacy.receipt.create')
    @Post('goods-receipts/:id/attachments')
    attachFiles(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AttachGoodsReceiptFilesDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.goodsReceiptsService.attachFiles(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: `Detach a file from a draft goods receipt`, description: `The stored file itself stays.` })
    @Authorize('pharmacy.receipt.create')
    @Delete('goods-receipts/:id/attachments/:attachmentId')
    removeAttachment(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
        @OrganizationId() orgId: string,
    ) {
        return this.goodsReceiptsService.removeAttachment(id, attachmentId, orgId);
    }
}
