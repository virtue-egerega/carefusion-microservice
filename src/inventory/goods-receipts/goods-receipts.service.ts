import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { FilesService } from '../../files/files.service';
import { $Enums } from '../../../generated/prisma/client';
import {
    AttachGoodsReceiptFilesDto, CreateGoodsReceiptDto, GoodsReceiptItemDto, UpdateGoodsReceiptDto, UpdateGoodsReceiptItemDto,
} from '@shared/contracts/inventory';
import { inEffectAt } from '../../billables/pricing/pricing.rules';
import { findOrCreateSupplier } from '../find-or-create';
import { StockItemsService } from '../items/stock-items.service';
import {
    costRolls, goodsReceiptTotals, postingProblems, priceWarning, goodsReceiptItemProductRefusal, goodsReceiptItemRefusal, goodsReceiptNumber, goodsReceiptSupplierRefusal, sellingUnitsAdded,
} from './goods-receipts.rules';

const NOT_FOUND = 'Goods receipt not found';

export type GoodsReceiptsQuery = {
    status?:     $Enums.ReceiptStatus;
    type?:       $Enums.ReceiptType;
    supplierId?: string;
    from?:       Date;   // receivedAt from (inclusive)
    to?:         Date;   // receivedAt to (exclusive)
    limit:       number;
    offset:      number;
};

const asDate = (value?: string) => value ? new Date(value) : undefined;

/** Who sees a receipt's costs and totals: whoever can see cost prices, or works on receipts (they enter them, §17). */
const canSeeReceiptCosts = (permissions: string[]) =>
    ['billable.cost.view', 'pharmacy.receipt.create', 'pharmacy.receipt.post'].some(p => permissions.includes(p));

const totalsItemSelect = { select: { purchaseUnitsDelivered: true, purchaseUnitsAccepted: true, purchaseUnitCost: true } };

/** Why a receipt that matched no draft row couldn't be changed: missing (404) or no longer a draft (409). */
const notDraft = (found: { status: string } | null) => found
    ? new ConflictException(`This receipt is ${found.status.toLowerCase()}; only a draft can be changed`)
    : new NotFoundException(NOT_FOUND);

/**
 * Goods receipts (PRD 15 §10): a delivery recorded as it arrived, its items one by one, and the post
 * that puts the stock in. Drafts change no stock. Scoped to the caller's organisation.
 */
@Injectable()
export class GoodsReceiptsService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly filesService: FilesService,
        private readonly stockItemsService: StockItemsService,
    ) {}

    /**
     * Drafts the receipt header (§10.2): the supplier found by name or created (§5), received into the
     * given pharmacy unit or the caller's branch store (§7.1), numbered from the organisation's counter,
     * with the invoice photos already uploaded (`attachmentFileIds`, one or more) attached.
     */
    async create(dto: CreateGoodsReceiptDto, organizationId: string, callerBranchId: string | null, createdBy: string) {
        const type = dto.type ?? $Enums.ReceiptType.DELIVERY;
        const refusal = goodsReceiptSupplierRefusal(type, dto);
        if (refusal) throw new BadRequestException(refusal);

        return this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const unit = await this.receivingPharmacyUnit(organizationId, dto.pharmacyUnitId, callerBranchId);
            const supplierId = await this.supplierFor(organizationId, dto, createdBy);
            await this.filesService.assertOwned(dto.attachmentFileIds ?? [], organizationId);

            // the counter row stays locked until this commits, so two receipts never share a number
            const [counter] = await tx.$queryRaw<{ lastNumber: number }[]>`
                INSERT INTO "SequenceCounter" ("scope", "lastNumber") VALUES (${`grn:${organizationId}`}, 1)
                ON CONFLICT ("scope") DO UPDATE SET "lastNumber" = "SequenceCounter"."lastNumber" + 1
                RETURNING "lastNumber"`;

            const { id, number } = await tx.goodsReceipt.create({
                data: {
                    organizationId,
                    branchId:            unit.branchId,
                    number:              goodsReceiptNumber(counter.lastNumber),
                    type,
                    pharmacyUnitId:      unit.id,
                    supplierId,
                    supplierInvoiceNo:   dto.supplierInvoiceNo,
                    supplierInvoiceDate: asDate(dto.supplierInvoiceDate),
                    supplierInvoiceTotal: dto.supplierInvoiceTotal,
                    deliveryNote:        dto.deliveryNote,
                    receivedAt:          new Date(dto.receivedAt),
                    notes:               dto.notes,
                    createdBy,
                    ...(dto.attachmentFileIds?.length && {
                        attachments: { createMany: { data: dto.attachmentFileIds.map(storedFileId => ({ storedFileId, attachedBy: createdBy })) } },
                    }),
                },
                select: { id: true, number: true },
            });
            return { id, number, message: 'Receipt drafted' };
        });
    }

    /**
     * Newest arrivals first, with the supplier, pharmacy unit, how many items each has and, for whoever can
     * see receipt costs, its totals (§10.4).
     */
    async findAll(organizationId: string, query: GoodsReceiptsQuery, permissions: string[]) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.status && { status: query.status }),
            ...(query.type && { type: query.type }),
            ...(query.supplierId && { supplierId: query.supplierId }),
            ...((query.from || query.to) && { receivedAt: { ...(query.from && { gte: query.from }), ...(query.to && { lt: query.to }) } }),
        };

        const canSeeCost = canSeeReceiptCosts(permissions);
        const [count, receipts] = await client.$transaction([
            client.goodsReceipt.count({ where }),
            client.goodsReceipt.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: [{ receivedAt: 'desc' }, { number: 'desc' }],
                include: {
                    supplier:     { select: { id: true, name: true } },
                    pharmacyUnit: { select: { id: true, name: true } },
                    _count:       { select: { items: true, attachments: true } },
                    items:        totalsItemSelect,
                },
            }),
        ]);
        const docs = receipts.map(({ items, supplierInvoiceTotal, ...receipt }) => ({
            ...receipt,
            ...(canSeeCost && { totals: goodsReceiptTotals(items, supplierInvoiceTotal) }),
        }));
        return { count, docs };
    }

    /**
     * One receipt with its items (product, batch once posted), photos and totals (§10.4). Costs and totals
     * are shown to whoever can see cost prices or works on receipts (they enter them); others get neither (§17).
     */
    async findOne(receiptId: string, organizationId: string, permissions: string[]) {
        const receipt = await this.databaseService.client.goodsReceipt.findFirst({
            where:   { id: receiptId, organizationId },
            include: {
                supplier:    { select: { id: true, name: true } },
                pharmacyUnit: { select: { id: true, name: true, branchId: true } },
                items:       {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        stockItem: { select: { shelfNumber: true, item: { select: { id: true, code: true, name: true, sellingUnit: true } } } },
                        putAwayPharmacyUnit: { select: { id: true, name: true } },
                        batch:     { select: { id: true, batchNumber: true, expiryDate: true } },
                    },
                },
                attachments: {
                    orderBy: { attachedAt: 'asc' },
                    include: { storedFile: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, url: true } } },
                },
            },
        });
        if (!receipt) throw new NotFoundException(NOT_FOUND);

        const { supplierInvoiceTotal, ...shown } = receipt;
        return canSeeReceiptCosts(permissions)
            ? { ...shown, totals: goodsReceiptTotals(receipt.items, supplierInvoiceTotal) }
            : { ...shown, items: receipt.items.map(({ purchaseUnitCost, ...item }) => item) };
    }

    /** Edits a draft's header; a supplier given by name is found or created (§5). */
    async update(receiptId: string, dto: UpdateGoodsReceiptDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const receipt = await client.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true, type: true } });
        if (!receipt || receipt.status !== $Enums.ReceiptStatus.DRAFT) throw notDraft(receipt);

        const { supplier, supplierId: givenSupplierId, pharmacyUnitId, supplierInvoiceDate, receivedAt, ...fields } = dto;
        if (givenSupplierId || supplier) {
            const refusal = goodsReceiptSupplierRefusal(receipt.type, dto);
            if (refusal) throw new BadRequestException(refusal);
        }

        return this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const unit = pharmacyUnitId ? await this.receivingPharmacyUnit(organizationId, pharmacyUnitId, null) : undefined;
            const supplierId = givenSupplierId || supplier ? await this.supplierFor(organizationId, dto, updatedBy) : undefined;

            const { count } = await tx.goodsReceipt.updateMany({
                where: { id: receiptId, organizationId, status: $Enums.ReceiptStatus.DRAFT },
                data:  {
                    ...fields,
                    ...(unit && { pharmacyUnitId: unit.id, branchId: unit.branchId }),
                    ...(supplierId && { supplierId }),
                    supplierInvoiceDate: asDate(supplierInvoiceDate),
                    receivedAt:          asDate(receivedAt),
                    updatedBy,
                },
            });
            if (!count) throw notDraft(await tx.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true } }));
            return { message: 'Receipt updated' };
        });
    }

    /** Cancels a draft (§10.1). A posted receipt is never cancelled: corrections are adjustments (§14). */
    async cancel(receiptId: string, reason: string, organizationId: string, cancelledBy: string) {
        const client = this.databaseService.client;
        const { count } = await client.goodsReceipt.updateMany({
            where: { id: receiptId, organizationId, status: $Enums.ReceiptStatus.DRAFT },
            data:  { status: $Enums.ReceiptStatus.CANCELLED, cancelledAt: new Date(), cancelledBy, cancelReason: reason },
        });
        if (!count) throw notDraft(await client.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true } }));
        return { message: 'Receipt cancelled' };
    }

    // ── items (§10.1) ────────────────────────────────────────────────────────

    /**
     * Adds one product to a draft, as on the invoice (§10.2): an existing stocked product by `stockItemId`, or a
     * new one created from `newProduct` in the same transaction, so going live never needs products set
     * up first. Its purchase unit and selling units per purchase unit are copied from the product, never
     * typed; `receiveAs` defaults from the product.
     */
    async addItem(receiptId: string, dto: GoodsReceiptItemDto, organizationId: string, userId: string, permissions: string[]) {
        const refusal = goodsReceiptItemProductRefusal(dto) ?? goodsReceiptItemRefusal(dto);
        if (refusal) throw new BadRequestException(refusal);

        return this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const receipt = await tx.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true } });
            if (!receipt || receipt.status !== $Enums.ReceiptStatus.DRAFT) throw notDraft(receipt);

            // a new product is created with the item; adding it is part of receiving, so receipt.create covers it
            const stockItemId = dto.newProduct
                ? (await this.stockItemsService.create(dto.newProduct, organizationId, userId, permissions)).id
                : dto.stockItemId!;
            const product = await tx.stockItem.findFirst({
                where:  { itemId: stockItemId, organizationId },
                select: { purchaseUnitName: true, sellingUnitsPerPurchaseUnit: true, quarantineOnReceipt: true },
            });
            if (!product) throw new NotFoundException('Stocked product not found');

            const { id } = await tx.goodsReceiptItem.create({
                data: {
                    ...this.itemFields(dto),
                    receiptId,
                    stockItemId,
                    purchaseUnitName:            product.purchaseUnitName,
                    sellingUnitsPerPurchaseUnit: product.sellingUnitsPerPurchaseUnit,
                    purchaseUnitsDelivered:      dto.purchaseUnitsDelivered,
                    purchaseUnitsAccepted:       dto.purchaseUnitsAccepted,
                    purchaseUnitCost:            dto.purchaseUnitCost,
                    receiveAs:                   dto.receiveAs ?? (product.quarantineOnReceipt ? $Enums.StockStatus.QUARANTINE : $Enums.StockStatus.AVAILABLE),
                },
                select: { id: true },
            });
            return { id, stockItemId, message: dto.newProduct ? 'Product added and item added' : 'Item added' };
        });
    }

    /** Changes one item of a draft. A different product copies that product's units afresh. */
    async updateItem(receiptId: string, receiptItemId: string, dto: UpdateGoodsReceiptItemDto, organizationId: string) {
        const client = this.databaseService.client;
        const current = await client.goodsReceiptItem.findFirst({
            where:  { id: receiptItemId, receiptId, receipt: { organizationId } },
            select: {
                stockItemId: true, purchaseUnitsDelivered: true, purchaseUnitsAccepted: true, rejectReason: true, updateCost: true, keepCostReason: true,
                receipt: { select: { status: true } },
            },
        });
        if (!current) throw new NotFoundException('Receipt item not found');
        if (current.receipt.status !== $Enums.ReceiptStatus.DRAFT) throw notDraft(current.receipt);

        const refusal = goodsReceiptItemRefusal({ ...current, ...dto });
        if (refusal) throw new BadRequestException(refusal);

        let units: { purchaseUnitName: string; sellingUnitsPerPurchaseUnit: number } | undefined;
        if (dto.stockItemId && dto.stockItemId !== current.stockItemId) {
            const product = await client.stockItem.findFirst({
                where:  { itemId: dto.stockItemId, organizationId },
                select: { purchaseUnitName: true, sellingUnitsPerPurchaseUnit: true },
            });
            if (!product) throw new NotFoundException('Stocked product not found');
            units = product;
        }

        const { count } = await client.goodsReceiptItem.updateMany({
            where: { id: receiptItemId, receipt: { status: $Enums.ReceiptStatus.DRAFT } },
            data:  {
                ...this.itemFields(dto),
                ...(dto.stockItemId && { stockItemId: dto.stockItemId }),
                ...units,
                purchaseUnitsDelivered: dto.purchaseUnitsDelivered,
                purchaseUnitsAccepted:  dto.purchaseUnitsAccepted,
                purchaseUnitCost:       dto.purchaseUnitCost,
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

    // ── posting (§10.2, §11) ─────────────────────────────────────────────────

    /**
     * Puts the receipt into stock, in one transaction: claims the draft (so it's posted once), checks every
     * item and reports all problems in one 400, finds or creates each lot's batch, writes one RECEIPT (or
     * OPENING) transaction with a movement per accepted item (the trigger updates the balances), rolls
     * cost prices forward (§11) and records batch and cost price on the items. Returns `priceWarnings`:
     * products now selling below their cost price per selling unit, or with no selling price yet.
     */
    async post(receiptId: string, organizationId: string, postedBy: string) {
        return this.databaseService.transaction(async () => {
            const tx = this.databaseService.client;
            const now = new Date();

            const { count } = await tx.goodsReceipt.updateMany({
                where: { id: receiptId, organizationId, status: $Enums.ReceiptStatus.DRAFT },
                data:  { status: $Enums.ReceiptStatus.POSTED, postedAt: now, postedBy },
            });
            if (!count) {
                const found = await tx.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true } });
                throw found ? new ConflictException(`This receipt is already ${found.status.toLowerCase()}`) : new NotFoundException(NOT_FOUND);
            }

            const receipt = await tx.goodsReceipt.findUniqueOrThrow({
                where:  { id: receiptId },
                select: {
                    number: true, type: true, branchId: true, pharmacyUnitId: true, receivedAt: true, supplierInvoiceNo: true,
                    supplier: { select: { status: true } },
                    items:    {
                        orderBy: { createdAt: 'asc' },
                        include: {
                            stockItem: {
                                select: {
                                    batchTracked: true, sellingUnitsPerPurchaseUnit: true,
                                    item: { select: { name: true, status: true, sellingUnit: true } },
                                },
                            },
                        },
                    },
                },
            });
            // the rules and ledger key stock by item: the stocked product the receipt item names
            const items = receipt.items.map(i => ({ ...i, itemId: i.stockItemId }));
            const unitOf = (item: { putAwayPharmacyUnitId: string | null }) => item.putAwayPharmacyUnitId ?? receipt.pharmacyUnitId;
            const itemIds = [...new Set(items.map(i => i.itemId))];
            const lots = items.flatMap(i => i.batchNumber ? [{ itemId: i.itemId, batchNumber: i.batchNumber }] : []);

            const [units, existingBatches, products] = await Promise.all([
                tx.pharmacyUnit.findMany({
                    where:  { id: { in: [...new Set(items.map(unitOf))] }, organizationId, branchId: receipt.branchId, status: $Enums.CatalogStatus.ACTIVE },
                    select: { id: true },
                }),
                lots.length
                    ? tx.stockBatch.findMany({ where: { OR: lots }, select: { id: true, itemId: true, batchNumber: true, expiryDate: true, manufacturedOn: true } })
                    : [],
                tx.billableItem.findMany({
                    where:  { id: { in: itemIds } },
                    select: {
                        id:            true,
                        costPrices:    { where: inEffectAt(now), take: 1, select: { purchaseUnitCost: true, sellingUnitsPerPurchaseUnit: true } },
                        sellingPrices: { where: { payerId: null, ...inEffectAt(now) }, take: 1, select: { basis: true, sellingUnitPrice: true } },
                    },
                }),
            ]);
            const activeUnits = new Set(units.map(u => u.id));
            const batchOf = (itemId: string, batchNumber: string) => existingBatches.find(b => b.itemId === itemId && b.batchNumber === batchNumber);

            const problems = postingProblems(items.map(i => ({
                product:                            i.stockItem.item.name,
                batchTracked:                       i.stockItem.batchTracked,
                productActive:                      i.stockItem.item.status === $Enums.CatalogStatus.ACTIVE,
                sellingUnitsPerPurchaseUnit:        i.sellingUnitsPerPurchaseUnit,
                productSellingUnitsPerPurchaseUnit: i.stockItem.sellingUnitsPerPurchaseUnit,
                batchNumber:                        i.batchNumber,
                expiryDate:                         i.expiryDate,
                manufacturedOn:                     i.manufacturedOn,
                pharmacyUnitOk:                     activeUnits.has(unitOf(i)),
                existingBatch:                      i.batchNumber ? batchOf(i.itemId, i.batchNumber) ?? null : undefined,
            })), receipt.receivedAt);
            if (receipt.type === $Enums.ReceiptType.DELIVERY && receipt.supplier?.status !== $Enums.CatalogStatus.ACTIVE) {
                problems.unshift('The supplier is inactive');
            }

            const currentCosts = new Map(products.flatMap(p => p.costPrices[0] ? [[p.id, p.costPrices[0]] as const] : []));
            const { rolls, conflicts } = costRolls(items.map(i => ({ ...i, product: i.stockItem.item.name })), currentCosts);
            for (const product of conflicts) {
                problems.push(`${product}: items with different costs would both update the cost price; untick updateCost on all but one`);
            }
            if (problems.length) throw new BadRequestException(`Can't post: ${problems.join('; ')}`);

            // one batch per lot (product + batch number); an item that isn't batch-tracked gets a batch of its own
            const batchIds = new Map<string, string>();
            const lotKey = (i: { id: string; itemId: string; batchNumber: string | null }) => i.batchNumber ? `${i.itemId}|${i.batchNumber}` : i.id;
            const newBatches = items.flatMap(i => {
                if (batchIds.has(lotKey(i))) return [];
                const existing = i.batchNumber ? batchOf(i.itemId, i.batchNumber) : undefined;
                batchIds.set(lotKey(i), existing?.id ?? randomUUID());
                return existing ? [] : [{
                    id:              batchIds.get(lotKey(i))!,
                    organizationId,
                    itemId:          i.itemId,
                    batchNumber:     i.batchNumber,
                    manufacturedOn:  i.manufacturedOn,
                    expiryDate:      i.expiryDate,
                    firstReceivedAt: receipt.receivedAt,
                    createdBy:       postedBy,
                }];
            });
            if (newBatches.length) await tx.stockBatch.createMany({ data: newBatches });

            const { id: transactionId } = await tx.stockTransaction.create({
                data: {
                    organizationId,
                    branchId:   receipt.branchId,
                    type:       receipt.type === $Enums.ReceiptType.OPENING ? $Enums.StockTransactionType.OPENING : $Enums.StockTransactionType.RECEIPT,
                    sourceType: 'GoodsReceipt',
                    sourceId:   receiptId,
                    occurredAt: now,
                    createdBy:  postedBy,
                },
                select: { id: true },
            });
            const accepted = items.filter(i => i.purchaseUnitsAccepted > 0);
            if (accepted.length) {
                await tx.stockMovement.createMany({
                    data: accepted.map(i => ({
                        transactionId,
                        organizationId,
                        pharmacyUnitId:      unitOf(i),
                        itemId:              i.itemId,
                        batchId:             batchIds.get(lotKey(i))!,
                        status:              i.receiveAs,
                        sellingUnitQuantity: sellingUnitsAdded(i),
                    })),
                });
            }

            // the cost price in effect ends now and the receipt's starts now: no backdating (§11)
            const rolledCostIds = new Map<string, string>();
            const costReason = `Goods receipt ${receipt.number}`;
            for (const [itemId, item] of rolls) {
                await tx.itemCostPrice.updateMany({
                    where: { itemId, ...inEffectAt(now) },
                    data:  { effectiveTo: now, endedAt: now, endedBy: postedBy, endReason: costReason },
                });
                const { id } = await tx.itemCostPrice.create({
                    data: {
                        itemId,
                        purchaseUnitCost:            item.purchaseUnitCost,
                        sellingUnitsPerPurchaseUnit: item.sellingUnitsPerPurchaseUnit,
                        effectiveFrom:               now,
                        source:                      [receipt.number, receipt.supplierInvoiceNo].filter(Boolean).join(' · '),
                        reason:                      costReason,
                        createdBy:                   postedBy,
                    },
                    select: { id: true },
                });
                rolledCostIds.set(itemId, id);
            }

            for (const i of items) {
                await tx.goodsReceiptItem.update({
                    where: { id: i.id },
                    data:  { batchId: batchIds.get(lotKey(i)), ...(i.updateCost && rolledCostIds.has(i.itemId) && { itemCostPriceId: rolledCostIds.get(i.itemId) }) },
                });
            }
            await tx.goodsReceipt.update({ where: { id: receiptId }, data: { transactionId } });

            const priceWarnings = products.flatMap(p => {
                const item = items.find(i => i.itemId === p.id)!;
                const warning = priceWarning(
                    { itemId: p.id, name: item.stockItem.item.name, sellingUnit: item.stockItem.item.sellingUnit },
                    rolls.get(p.id) ?? p.costPrices[0],
                    p.sellingPrices[0],
                );
                return warning ? [warning] : [];
            });
            return { id: receiptId, message: `Receipt posted: ${accepted.length} item(s) into stock`, priceWarnings };
        });
    }

    // ── invoice photos (§10.3) ───────────────────────────────────────────────

    /**
     * Attaches stored files (ids from POST /files) to a draft or posted receipt: an invoice page that
     * turns up after the goods. A file already attached is left as it is.
     */
    async attachFiles(receiptId: string, dto: AttachGoodsReceiptFilesDto, organizationId: string, attachedBy: string) {
        const client = this.databaseService.client;
        const receipt = await client.goodsReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { status: true } });
        if (!receipt) throw new NotFoundException(NOT_FOUND);
        if (receipt.status === $Enums.ReceiptStatus.CANCELLED) throw new ConflictException('This receipt is cancelled');
        await this.filesService.assertOwned(dto.attachmentFileIds, organizationId);

        const { count } = await client.goodsReceiptAttachment.createMany({
            data:           dto.attachmentFileIds.map(storedFileId => ({ receiptId, storedFileId, description: dto.description, attachedBy })),
            skipDuplicates: true,
        });
        return { count, message: `${count} file(s) attached` };
    }

    /** Detaches a file while the receipt is a draft (the stored file stays). Once posted, the attachments are the evidence and stay. */
    async removeAttachment(receiptId: string, attachmentId: string, organizationId: string) {
        const client = this.databaseService.client;
        const { count } = await client.goodsReceiptAttachment.deleteMany({
            where: { id: attachmentId, receiptId, receipt: { organizationId, status: $Enums.ReceiptStatus.DRAFT } },
        });
        if (!count) {
            const found = await client.goodsReceiptAttachment.findFirst({
                where:  { id: attachmentId, receiptId, receipt: { organizationId } },
                select: { receipt: { select: { status: true } } },
            });
            throw found ? notDraft(found.receipt) : new NotFoundException('Attachment not found');
        }
        return { message: 'Attachment removed' };
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

    /** The pharmacy unit given (active, the organisation's), or the caller's branch store when there's exactly one (§7.1). */
    private async receivingPharmacyUnit(organizationId: string, pharmacyUnitId: string | undefined, branchId: string | null) {
        const client = this.databaseService.client;
        if (pharmacyUnitId) {
            const unit = await client.pharmacyUnit.findFirst({
                where:  { id: pharmacyUnitId, organizationId, status: $Enums.CatalogStatus.ACTIVE },
                select: { id: true, branchId: true },
            });
            if (!unit) throw new NotFoundException('Pharmacy unit not found or inactive');
            return unit;
        }
        if (!branchId) throw new BadRequestException('Choose the pharmacy unit to receive into');

        const stores = await client.pharmacyUnit.findMany({
            where:  { organizationId, branchId, type: $Enums.PharmacyUnitType.STORE, status: $Enums.CatalogStatus.ACTIVE },
            select: { id: true, branchId: true },
            take:   2,
        });
        if (!stores.length) throw new BadRequestException('Your branch has no active store; choose the pharmacy unit to receive into');
        if (stores.length > 1) throw new BadRequestException('Your branch has more than one store; choose the pharmacy unit to receive into');
        return stores[0];
    }

    /** The receipt's supplier: found by name or created, or by id; it must be active. Null for opening stock. */
    private async supplierFor(organizationId: string, given: { supplierId?: string; supplier?: { name: string; phone?: string[]; email?: string } }, userId: string) {
        if (!given.supplierId && !given.supplier) return null;
        const supplier = given.supplier
            ? await findOrCreateSupplier(this.databaseService, organizationId, given.supplier, userId)
            : await this.databaseService.client.supplier.findFirst({ where: { id: given.supplierId, organizationId }, select: { id: true, status: true } });
        if (!supplier) throw new NotFoundException('Supplier not found');
        if (supplier.status !== $Enums.CatalogStatus.ACTIVE) throw new BadRequestException('That supplier is inactive');
        return supplier.id;
    }
}
