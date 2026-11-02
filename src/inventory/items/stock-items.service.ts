import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateStockedProductDto, StockItemDto } from '@shared/contracts/inventory';
import { visibleMedicines } from '../../medicine-management/medicines.rules';
import { findOrCreateCategory, findOrCreateManufacturer } from '../find-or-create';
import { productRefusal, stockItemRefusal, unitsChangeRefusal } from './stock-items.rules';

const NOT_STOCKED = 'Stocked item not found';
const CODE_CONFLICT = 'An item with this code already exists';

export type StockItemsQuery = {
    categoryId?: string;
    kind?:       $Enums.ServiceCategory;
    medicineId?: string;
    status?:     $Enums.CatalogStatus;
    search?:     string;
    branchId?:   string;   // stock totals for this branch only
    pharmacyUnitId?: string;   // stock totals for this pharmacy unit only
    limit:       number;
    offset:      number;
};

const stockItemInclude = {
    item:         {
        select: {
            id: true, code: true, name: true, sellingUnit: true, status: true,
            category: { select: { id: true, name: true, kind: true } },
        },
    },
    medicine:     { select: { id: true, genericName: true, strength: true, dosageForm: true, route: true, legalCategory: true, controlled: true } },
    manufacturer: { select: { id: true, name: true } },
};

/** Selling units held per status, keyed by item (zero for statuses with none). */
type StockByStatus = Record<$Enums.StockStatus, number>;
const emptyStock = (): StockByStatus => ({ AVAILABLE: 0, QUARANTINE: 0, DAMAGED: 0 });

/**
 * Stocked products (PRD 15 §3.2–§4): a billable the hospital holds in stock, with its medicine, maker,
 * selling unit and purchase unit. Scoped to the caller's organisation.
 */
@Injectable()
export class StockItemsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Adds a product (§3.3): the billable item, its stock settings and, if given, its first self-pay
     * price, in one transaction. The category and manufacturer are picked by id, or found by name and created
     * if new (§5). A created category is PHARMACY for a drug, CONSUMABLE otherwise.
     */
    async create(dto: CreateStockedProductDto, organizationId: string, createdBy: string, permissions: string[]) {
        const refusal = productRefusal(dto, permissions);
        if (refusal) throw 'forbidden' in refusal ? new ForbiddenException(refusal.reason) : new BadRequestException(refusal.reason);

        const {
            categoryId, category: newCategory, manufacturerId, manufacturer: newManufacturer, medicineId,
            code, name, description, sellingUnit, sellingUnitPrice, reason, storageCondition, ...stock
        } = dto;

        const { id } = await withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                const [medicine, categoryById, manufacturerById] = await Promise.all([
                    medicineId ? tx.medicine.findFirst({ where: { id: medicineId, ...visibleMedicines(organizationId) }, select: { status: true } }) : undefined,
                    categoryId ? tx.billableCategory.findFirst({ where: { id: categoryId, organizationId }, select: { id: true, kind: true, status: true } }) : undefined,
                    manufacturerId ? tx.manufacturer.findFirst({ where: { id: manufacturerId, organizationId }, select: { id: true, status: true } }) : undefined,
                ]);

                const category = newCategory
                    ? await findOrCreateCategory(this.databaseService, organizationId, { name: newCategory.name, kind: medicineId ? 'PHARMACY' : 'CONSUMABLE' }, createdBy)
                    : categoryById;
                if (!category) throw new NotFoundException('Billable category not found');
                if (category.status !== 'ACTIVE') throw new BadRequestException('That category is inactive');

                const manufacturer = newManufacturer
                    ? await findOrCreateManufacturer(this.databaseService, organizationId, newManufacturer, createdBy)
                    : manufacturerById;

                const stockRefusal = stockItemRefusal({
                    kind:         category.kind,
                    medicineId:   medicineId ?? null,
                    medicine:     medicineId ? medicine : undefined,
                    manufacturer: newManufacturer || manufacturerId ? manufacturer : undefined,
                });
                if (stockRefusal) throw stockRefusal.notFound ? new NotFoundException(stockRefusal.reason) : new BadRequestException(stockRefusal.reason);

                return tx.billableItem.create({
                    data: {
                        organizationId,
                        categoryId: category.id,
                        code,
                        name,
                        description,
                        sellingUnit,
                        createdBy,
                        stockItem: {
                            create: {
                                ...stock,
                                medicineId,
                                manufacturerId:   manufacturer?.id,
                                storageCondition: storageCondition as $Enums.StorageCondition | undefined,
                                createdBy,
                            },
                        },
                        ...(sellingUnitPrice !== undefined && {
                            sellingPrices: {
                                create: { basis: $Enums.PriceBasis.MANUAL, sellingUnitPrice, effectiveFrom: new Date(), reason: reason!, createdBy },
                            },
                        }),
                    },
                    select: { id: true },
                });
            }),
            { conflict: CODE_CONFLICT },
        );
        // a new product has no cost price yet, so a first price can't be below it (§11)
        return { id, message: 'Product added' };
    }

    /**
     * Makes an existing catalogue item stocked, or updates its stock settings (§3.3). The item, the
     * medicine and the manufacturer being set are read in one round trip, then checked together. The
     * units are required when first stocked and fixed once the product has stock (§3.4).
     */
    async upsert(itemId: string, dto: StockItemDto, organizationId: string, userId: string) {
        const client = this.databaseService.client;
        const [item, medicine, manufacturer] = await client.$transaction([
            client.billableItem.findFirst({
                where:  { id: itemId, organizationId },
                select: {
                    category:  { select: { kind: true } },
                    stockItem: {
                        select: {
                            medicineId: true, purchaseUnitName: true, sellingUnitsPerPurchaseUnit: true, sellableInHalves: true,
                            _count: { select: { batches: true } },
                        },
                    },
                },
            }),
            client.medicine.findFirst({ where: { id: dto.medicineId ?? '', ...visibleMedicines(organizationId) }, select: { status: true } }),
            client.manufacturer.findFirst({ where: { id: dto.manufacturerId ?? '', organizationId }, select: { status: true } }),
        ]);
        if (!item) throw new NotFoundException('Billable item not found');

        const refusal = stockItemRefusal({
            kind:         item.category.kind,
            medicineId:   dto.medicineId ?? item.stockItem?.medicineId ?? null,
            medicine:     dto.medicineId ? medicine : undefined,
            manufacturer: dto.manufacturerId ? manufacturer : undefined,
        }) ?? unitsChangeRefusal(
            item.stockItem && { ...item.stockItem, hasStock: item.stockItem._count.batches > 0 },
            { purchaseUnitName: dto.purchaseUnitName, sellingUnitsPerPurchaseUnit: dto.sellingUnitsPerPurchaseUnit, sellableInHalves: dto.sellableInHalves },
        );
        if (refusal) throw refusal.notFound ? new NotFoundException(refusal.reason) : new BadRequestException(refusal.reason);

        const data = { ...dto, storageCondition: dto.storageCondition as $Enums.StorageCondition | undefined };
        await client.stockItem.upsert({
            where:  { itemId },
            // unitsChangeRefusal has made sure both are present when the item is first stocked
            create: {
                ...data,
                purchaseUnitName:            dto.purchaseUnitName!,
                sellingUnitsPerPurchaseUnit: dto.sellingUnitsPerPurchaseUnit!,
                itemId, organizationId, createdBy: userId,
            },
            update: { ...data, updatedBy: userId },
        });
        return { message: item.stockItem ? 'Stock settings updated' : 'Item is now stocked' };
    }

    /**
     * Stocked products by name, paginated, each with its category, medicine, maker, units and the
     * selling units held per status (optionally for one branch or pharmacy unit). Which stock is usable
     * (expiry, recalls) is worked out by the stock views, not here.
     */
    async findAll(organizationId: string, query: StockItemsQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.medicineId && { medicineId: query.medicineId }),
            item: {
                ...(query.categoryId && { categoryId: query.categoryId }),
                ...(query.kind && { category: { kind: query.kind } }),
                ...(query.status && { status: query.status }),
            },
            ...(query.search && {
                OR: [
                    { item: { name: { contains: query.search, mode: 'insensitive' as const } } },
                    { item: { code: { contains: query.search, mode: 'insensitive' as const } } },
                    { brandName: { contains: query.search, mode: 'insensitive' as const } },
                    { medicine: { searchText: { contains: query.search.toLowerCase() } } },
                ],
            }),
        };

        const [count, items] = await client.$transaction([
            client.stockItem.count({ where }),
            client.stockItem.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { item: { name: 'asc' } },
                include: stockItemInclude,
            }),
        ]);

        const stock = await this.stockByStatus(organizationId, items.map(i => i.itemId), query);
        return { count, docs: items.map(item => ({ ...item, stock: stock.get(item.itemId) ?? emptyStock() })) };
    }

    /** One stocked product with its medicine, maker, units and selling units held per status. */
    async findOne(itemId: string, organizationId: string) {
        const item = await this.databaseService.client.stockItem.findFirst({
            where:   { itemId, organizationId },
            include: stockItemInclude,
        });
        if (!item) throw new NotFoundException(NOT_STOCKED);

        const stock = await this.stockByStatus(organizationId, [itemId], {});
        return { ...item, stock: stock.get(itemId) ?? emptyStock() };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Selling units held per item and status, in one grouped query. Whole or half, so Number is exact. */
    private async stockByStatus(organizationId: string, itemIds: string[], scope: { branchId?: string; pharmacyUnitId?: string }) {
        const byItem = new Map<string, StockByStatus>();
        if (!itemIds.length) return byItem;

        const rows = await this.databaseService.client.stockBalance.groupBy({
            by:    ['itemId', 'status'],
            where: {
                organizationId,
                itemId:              { in: itemIds },
                sellingUnitQuantity: { gt: 0 },
                ...(scope.branchId && { branchId: scope.branchId }),
                ...(scope.pharmacyUnitId && { pharmacyUnitId: scope.pharmacyUnitId }),
            },
            _sum:  { sellingUnitQuantity: true },
        });
        for (const row of rows) {
            const stock = byItem.get(row.itemId) ?? emptyStock();
            stock[row.status] = Number(row._sum.sellingUnitQuantity ?? 0);
            byItem.set(row.itemId, stock);
        }
        return byItem;
    }
}
