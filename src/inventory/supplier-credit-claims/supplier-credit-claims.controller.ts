import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { SettleSupplierClaimDto, WaiveSupplierClaimDto } from '@shared/contracts/inventory';
import { SupplierClaimStatus } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { SupplierCreditClaimsService } from './supplier-credit-claims.service';

/** What suppliers owe the hospital (PRD 15 §10.5): goods paid for and handed back, recorded when a receipt is posted. */
@ApiTags('inventory')
@Controller('pharmacy/supplier-credit-claims')
export class SupplierCreditClaimsController {
    constructor(private readonly supplierCreditClaimsService: SupplierCreditClaimsService) {}

    // declared before `:id`, which would otherwise capture `metrics`
    @ApiOperation({
        summary: `Supplier claim counts per status, and how much is still owed`,
        description: `\`{ byStatus: { OUTSTANDING, SETTLED, WAIVED }, amountOutstanding }\`, zero where there are none.`,
    })
    @ApiQuery({ name: 'supplierId', required: false })
    @ApiQuery({ name: 'branchId', required: false })
    @Authorize('pharmacy.supplier.claim.manage')
    @Get('metrics')
    metrics(
        @OrganizationId() orgId: string,
        @Query('supplierId', new ParseUUIDPipe({ optional: true })) supplierId?: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
    ) {
        return this.supplierCreditClaimsService.metrics(orgId, { supplierId, branchId });
    }

    @ApiOperation({
        summary: `What suppliers owe, oldest first`,
        description: `\`count\` is the total matching the filters; \`docs\` is the page. Each claim has its \`number\` (quoted to the supplier), ` +
        `\`supplier\`, the goods receipt line it came from (receipt number, product, line total), \`purchaseUnitsClaimed\`, ` +
        `\`purchaseUnitCost\`, \`amountOwed\` and \`status\`.`,
    })
    @ApiQuery({ name: 'supplierId', required: false })
    @ApiQuery({ name: 'status', enum: SupplierClaimStatus, required: false })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'from', required: false, description: 'Recorded on or after (ISO date)' })
    @ApiQuery({ name: 'to', required: false, description: 'Recorded before (ISO date)' })
    @Authorize('pharmacy.supplier.claim.manage')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('supplierId', new ParseUUIDPipe({ optional: true })) supplierId?: string,
        @Query('status', new ParseEnumPipe(SupplierClaimStatus, { optional: true })) status?: SupplierClaimStatus,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.supplierCreditClaimsService.findAll(orgId, {
            supplierId,
            status:   status as $Enums.SupplierClaimStatus | undefined,
            branchId,
            from:     from ? new Date(from) : undefined,
            to:       to ? new Date(to) : undefined,
            limit,
            offset,
        });
    }

    @ApiOperation({
        summary: `One supplier claim`,
        description: `The goods receipt line it came from, the replacement receipt if settled by REPLACEMENT, and every person on it ` +
        `(\`createdBy\`, who posted the receipt; \`settledBy\`; \`waivedBy\`) as \`{ id, firstName, lastName }\`, null when unset.`,
    })
    @Authorize('pharmacy.supplier.claim.manage')
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.supplierCreditClaimsService.findOne(id, orgId);
    }

    @ApiOperation({
        summary: `Settle a supplier claim`,
        description: `\`settledAs\`: CREDIT_NOTE, REFUND, or REPLACEMENT with \`replacementGoodsReceiptId\` (a later posted delivery from the ` +
        `same supplier). \`settlementReference\` is the supplier's credit note or refund reference. Final; 409 if already settled or waived.`,
    })
    @Authorize('pharmacy.supplier.claim.manage')
    @HttpCode(200)
    @Post(':id/settle')
    settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleSupplierClaimDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.supplierCreditClaimsService.settle(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: `Waive a supplier claim`, description: `The hospital writes it off, with a \`reason\`. Final; 409 if already settled or waived.` })
    @Authorize('pharmacy.supplier.claim.manage')
    @HttpCode(200)
    @Post(':id/waive')
    waive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WaiveSupplierClaimDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.supplierCreditClaimsService.waive(id, dto.reason, orgId, user.sub);
    }
}
