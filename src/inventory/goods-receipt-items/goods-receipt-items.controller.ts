import {
    Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags} from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import {
    GoodsReceiptItemDto,
    UpdateGoodsReceiptItemDto,
} from '@shared/contracts/inventory';
import { GoodsReceiptItemsService } from './goods-receipt-items.service';

@ApiTags('inventory')
@Controller('pharmacy/goods-receipts/:id/items')
export class GoodsReceiptItemsController {
  constructor(private readonly goodsReceiptItemsService: GoodsReceiptItemsService) {}

  // ── items ────────────────────────────────────────────────────────────────
  
      @ApiOperation({
          summary: `Add a product to a draft goods receipt, as on the invoice`,
          description: `Pick a stocked product on the system by \`stockItemId\`, or add a new one with \`newProduct\` (created with the item; ` +
          `a first selling price in it needs billable.price.create). The purchase unit and selling units per purchase unit are ` +
          `copied from the product. Give \`invoiceLineTotal\`, what the line says was paid for the purchase units delivered: the cost ` +
          `of one purchase unit is worked out from it, rounded up, never sent. Returns \`{ id, stockItemId, message }\`.`,
      })
      @Authorize('pharmacy.receipt.create')
      @Post()
      create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GoodsReceiptItemDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
          return this.goodsReceiptItemsService.addItem(id, dto, orgId, user.sub, user.permissions);
      }
  
      @ApiOperation({
          summary: `A goods receipt's items, in the order entered`,
          description: `\`count\` is the receipt's item total; \`docs\` is the page. Each with its product, put-away unit, batch once posted ` +
          `and \`sellingUnitsAccepted\`; \`invoiceLineTotal\`, \`purchaseUnitCost\`, \`acceptedValue\` and \`amountOwed\` only for whoever can see receipt costs.`,
      })
      @Authorize('pharmacy.stock.view')
      @Get()
      findAll(
          @Param('id', ParseUUIDPipe) id: string,
          @OrganizationId() orgId: string,
          @CurrentUser() user: AuthUser,
          @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
          @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
      ) {
          return this.goodsReceiptItemsService.findAll(id, orgId, { limit, offset }, user.permissions);
      }

      @ApiOperation({
          summary: `One item of a goods receipt`,
          description: `The product it received, its receipt, where it was put away, its batch once posted, and \`sellingUnitsAccepted\`. ` +
          `\`invoiceLineTotal\`, \`purchaseUnitCost\`, \`acceptedValue\` and \`amountOwed\` only for whoever can see receipt costs.`,
      })
      @Authorize('pharmacy.stock.view')
      @Get(':itemId')
      findOne(
          @Param('id', ParseUUIDPipe) id: string,
          @Param('itemId', ParseUUIDPipe) itemId: string,
          @OrganizationId() orgId: string,
          @CurrentUser() user: AuthUser,
      ) {
          return this.goodsReceiptItemsService.findOne(id, itemId, orgId, user.permissions);
      }

      @ApiOperation({ summary: `Change an item of a draft receipt` })
      @Authorize('pharmacy.receipt.create')
      @Patch(':itemId')
      updateItem(
          @Param('id', ParseUUIDPipe) id: string,
          @Param('itemId', ParseUUIDPipe) itemId: string,
          @Body() dto: UpdateGoodsReceiptItemDto,
          @OrganizationId() orgId: string,
      ) {
          return this.goodsReceiptItemsService.updateItem(id, itemId, dto, orgId);
      }
  
      @ApiOperation({ summary: `Remove an item from a draft receipt` })
      @Authorize('pharmacy.receipt.create')
      @Delete(':itemId')
      removeItem(@Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @OrganizationId() orgId: string) {
          return this.goodsReceiptItemsService.removeItem(id, itemId, orgId);
      }
}
