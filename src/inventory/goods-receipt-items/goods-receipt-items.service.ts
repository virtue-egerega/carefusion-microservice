import { BadRequestException,  ConflictException,  Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { FilesService } from '../../files/files.service';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import {
     GoodsReceiptItemDto, UpdateGoodsReceiptItemDto,
} from '@shared/contracts/inventory';
import { StockItemsService } from '../items/stock-items.service';
import {
    acceptedValue, amountOwed, goodsReceiptItemProductRefusal, goodsReceiptItemRefusal, purchaseUnitCostFromLineTotal,
} from './goods-receipts.rules';

const NOT_FOUND = 'Goods receipt not found';
/** Why a receipt that matched no draft row couldn't be changed: missing (404) or no longer a draft (409). */
const notDraft = (found: { status: string } | null) => found
    ? new ConflictException(`This receipt is ${found.status.toLowerCase()}; only a draft can be changed`)
    : new NotFoundException(NOT_FOUND);

const asDate = (value?: string) => value ? new Date(value) : undefined;

/** Who sees an item's cost: whoever can see cost prices, or works on receipts (they enter them, §17). */
const canSeeReceiptCosts = (permissions: string[]) =>
    ['billable.cost.view', 'pharmacy.receipt.create', 'pharmacy.receipt.post'].some(p => permissions.includes(p));

/**
 * An item as shown: the selling units it adds and, to whoever can see receipt costs, what it put into stock and what
 * the supplier owes for it (§10.4); others get it without any money.
 */
function shownItem<T extends {
    purchaseUnitsDelivered: number; purchaseUnitsAccepted: number; sellingUnitsPerPurchaseUnit: number;
    purchaseUnitCost: Prisma.Decimal; invoiceLineTotal: Prisma.Decimal; itemCostPriceId: string | null;
}>(item: T, canSeeCost: boolean) {
    const shown = { ...item, sellingUnitsAccepted: item.purchaseUnitsAccepted * item.sellingUnitsPerPurchaseUnit };
    if (canSeeCost) return { ...shown, acceptedValue: acceptedValue(item), amountOwed: amountOwed(item) };
    const { purchaseUnitCost, invoiceLineTotal, itemCostPriceId, ...withoutCost } = shown;
    return withoutCost;
}

@Injectable()
export class GoodsReceiptItemsService {
        constructor(
            private readonly databaseService: DatabaseService,
            private readonly stockItemsService: StockItemsService,
        ) {}
          // ── items (§10.1) ────────────────────────────────────────────────────────
  
      /**
       * Adds one product to a draft, as on the invoice (§10.2): an existing stocked product by `stockItemId`, or a
       * new one created from `newProduct` in the same transaction, so going live never needs products set
       * up first. Its purchase unit and selling units per purchase unit are copied from the product, never
       * typed; `receiveAs` defaults from the product. The cost of one purchase unit is worked out from the invoice
       * line total, rounded up (§10.1), never taken from the caller.
       */
      async addItem(receiptId: string, dto: GoodsReceiptItemDto, organizationId: string, userId: string, permissions: string[]) {
          const productRefusal = goodsReceiptItemProductRefusal(dto);
          if (productRefusal) throw new BadRequestException(productRefusal);

          return this.databaseService.transaction(async () => {
              const tx = this.databaseService.client;
              const receipt = await tx.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true, type: true } });
              if (!receipt || receipt.status !== $Enums.ReceiptStatus.DRAFT) throw notDraft(receipt);

              const refusal = goodsReceiptItemRefusal({ ...dto, receiptType: receipt.type });
              if (refusal) throw new BadRequestException(refusal);
  
              // a new product is created with the item; adding it is part of receiving, so receipt.create covers it
              const stockItemId = dto.newProduct
                  ? (await this.stockItemsService.create(dto.newProduct, organizationId, userId, permissions)).id
                  : dto.stockItemId!;
              const product = await tx.stockItem.findFirst({
                  where:  { itemId: stockItemId, organizationId },
                  select: { purchaseUnit: { select: { name: true } }, sellingUnitsPerPurchaseUnit: true, quarantineOnReceipt: true },
              });
              if (!product) throw new NotFoundException('Stocked product not found');
  
              const { id } = await tx.goodsReceiptItem.create({
                  data: {
                      ...this.itemFields(dto),
                      receiptId,
                      stockItemId,
                      purchaseUnitName:            product.purchaseUnit.name,   // copied: the receipt reads as entered (§4.1)
                      sellingUnitsPerPurchaseUnit: product.sellingUnitsPerPurchaseUnit,
                      purchaseUnitsDelivered:      dto.purchaseUnitsDelivered,
                      purchaseUnitsAccepted:       dto.purchaseUnitsAccepted,
                      invoiceLineTotal:            dto.invoiceLineTotal,
                      purchaseUnitCost:            purchaseUnitCostFromLineTotal(dto.invoiceLineTotal, dto.purchaseUnitsDelivered),
                      receiveAs:                   dto.receiveAs ?? (product.quarantineOnReceipt ? $Enums.StockStatus.QUARANTINE : $Enums.StockStatus.AVAILABLE),
                  },
                  select: { id: true },
              });
              return { id, stockItemId, message: dto.newProduct ? 'Product added and item added' : 'Item added' };
          });
      }
  
      /**
       * Changes one item of a draft. A different product copies that product's units afresh; a new line total or
       * number delivered works the cost of one purchase unit out again.
       */
      async updateItem(receiptId: string, receiptItemId: string, dto: UpdateGoodsReceiptItemDto, organizationId: string) {
          const client = this.databaseService.client;
          const current = await client.goodsReceiptItem.findFirst({
              where:  { id: receiptItemId, receiptId, receipt: { organizationId } },
              select: {
                  stockItemId: true, purchaseUnitsDelivered: true, purchaseUnitsAccepted: true, invoiceLineTotal: true, rejectReason: true,
                  updateCost: true, keepCostReason: true,
                  receipt: { select: { status: true, type: true } },
              },
          });
          if (!current) throw new NotFoundException('Receipt item not found');
          if (current.receipt.status !== $Enums.ReceiptStatus.DRAFT) throw notDraft(current.receipt);
  
          const refusal = goodsReceiptItemRefusal({ ...current, ...dto, receiptType: current.receipt.type });
          if (refusal) throw new BadRequestException(refusal);

          const invoiceLineTotal = dto.invoiceLineTotal ?? current.invoiceLineTotal;
          const purchaseUnitsDelivered = dto.purchaseUnitsDelivered ?? current.purchaseUnitsDelivered;
          const lineChanged = dto.invoiceLineTotal !== undefined || dto.purchaseUnitsDelivered !== undefined;
  
          let units: { purchaseUnitName: string; sellingUnitsPerPurchaseUnit: number } | undefined;
          if (dto.stockItemId && dto.stockItemId !== current.stockItemId) {
              const product = await client.stockItem.findFirst({
                  where:  { itemId: dto.stockItemId, organizationId },
                  select: { purchaseUnit: { select: { name: true } }, sellingUnitsPerPurchaseUnit: true },
              });
              if (!product) throw new NotFoundException('Stocked product not found');
              units = { purchaseUnitName: product.purchaseUnit.name, sellingUnitsPerPurchaseUnit: product.sellingUnitsPerPurchaseUnit };
          }
  
          const { count } = await client.goodsReceiptItem.updateMany({
              where: { id: receiptItemId, receipt: { status: $Enums.ReceiptStatus.DRAFT } },
              data:  {
                  ...this.itemFields(dto),
                  ...(dto.stockItemId && { stockItemId: dto.stockItemId }),
                  ...units,
                  purchaseUnitsDelivered: dto.purchaseUnitsDelivered,
                  purchaseUnitsAccepted:  dto.purchaseUnitsAccepted,
                  ...(lineChanged && { invoiceLineTotal, purchaseUnitCost: purchaseUnitCostFromLineTotal(invoiceLineTotal, purchaseUnitsDelivered) }),
                  receiveAs:              dto.receiveAs,
              },
          });
          // the receipt was posted or cancelled since it was read
          if (!count) throw notDraft(await client.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true } }));
          return { message: 'Item updated' };
      }
  
      /** Removes one item from a draft. */
      async removeItem(receiptId: string, receiptItemId: string, organizationId: string) {
          const client = this.databaseService.client;
          const { count } = await client.goodsReceiptItem.deleteMany({
              where: { id: receiptItemId, receiptId, receipt: { organizationId, status: $Enums.ReceiptStatus.DRAFT } },
          });
          if (!count) {
              const found = await client.goodsReceiptItem.findFirst({
                  where:  { id: receiptItemId, receiptId, receipt: { organizationId } },
                  select: { receipt: { select: { status: true } } },
              });
              throw found ? notDraft(found.receipt) : new NotFoundException('Receipt item not found');
          }
          return { message: 'Item removed' };
      }

      /**
       * A goods receipt's items in the order they were entered, each with its product, put-away unit, batch once
       * posted and the selling units it adds; costs as for findOne. The receipt is read in the same round trip,
       * only to tell "no such receipt" (404) from "no items".
       */
      async findAll(receiptId: string, organizationId: string, page: { limit: number; offset: number }, permissions: string[]) {
          const client = this.databaseService.client;
          const where = { receiptId, receipt: { organizationId } };

          const [receipt, count, items] = await client.$transaction([
              client.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { id: true } }),
              client.goodsReceiptItem.count({ where }),
              client.goodsReceiptItem.findMany({
                  where,
                  take:    page.limit,
                  skip:    page.offset,
                  orderBy: { createdAt: 'asc' },
                  include: {
                      stockItem:           { select: { shelfNumber: true, item: { select: { id: true, code: true, name: true, sellingUnit: { select: { id: true, name: true, pluralName: true } } } } } },
                      putAwayPharmacyUnit: { select: { id: true, name: true } },
                      batch:               { select: { id: true, batchNumber: true, expiryDate: true, qualityStatus: true } },
                  },
              }),
          ]);
          if (!receipt) throw new NotFoundException(NOT_FOUND);

          const canSeeCost = canSeeReceiptCosts(permissions);
          return { count, docs: items.map(item => shownItem(item, canSeeCost)) };
      }

      /**
       * One item of a goods receipt: the product it received, its receipt, where it was put away, its batch once
       * posted, and the selling units it adds. Its cost and line value are shown to whoever can see receipt
       * costs (they enter them, §17); others get the item without them.
       */
      async findOne(receiptId: string, receiptItemId: string, organizationId: string, permissions: string[]) {
          const item = await this.databaseService.client.goodsReceiptItem.findFirst({
              where:   { id: receiptItemId, receiptId, receipt: { organizationId } },
              include: {
                  receipt:             { select: { id: true, number: true, status: true, receivedAt: true, supplier: { select: { id: true, name: true } } } },
                  stockItem:           {
                      select: {
                          shelfNumber: true, sellableInHalves: true, batchTracked: true,
                          item:     { select: { id: true, code: true, name: true, sellingUnit: { select: { id: true, name: true, pluralName: true } } } },
                          medicine: { select: { id: true, genericName: true, strength: true, dosageForm: true } },
                      },
                  },
                  putAwayPharmacyUnit: { select: { id: true, name: true } },
                  batch:               { select: { id: true, batchNumber: true, expiryDate: true, qualityStatus: true } },
                  supplierCreditClaim: { select: { id: true, number: true, status: true } },
              },
          });
          if (!item) throw new NotFoundException('Receipt item not found');

          return shownItem(item, canSeeReceiptCosts(permissions));
      }
      // ── helpers ──────────────────────────────────────────────────────────────

    /** The optional fields of an item as entered, with its dates parsed. */
    private itemFields(dto: UpdateGoodsReceiptItemDto) {
        return {
            rejectReason:   dto.rejectReason,
            batchNumber:    dto.batchNumber?.trim(),
            expiryDate:     asDate(dto.expiryDate),
            manufacturedOn: asDate(dto.manufacturedOn),
            putAwayPharmacyUnitId: dto.putAwayPharmacyUnitId,
            updateCost:     dto.updateCost,
            keepCostReason: dto.keepCostReason,
        };
    }
}
