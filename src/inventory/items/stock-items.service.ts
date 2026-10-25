import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateItemPackDto, StockItemDto, UpdateItemPackDto } from '@shared/contracts/inventory';
import { visibleMedicines } from '../medicines/medicines.rules';
import { packDefaultAfter, stockItemRefusal } from './stock-items.rules';

const PACK_CONFLICT = 'A pack with this name or barcode already exists';
const NOT_STOCKED = 'Stocked item not found';

export type StockItemsQuery = {
    categoryId?: string;
    kind?:       $Enums.ServiceCategory;
    medicineId?: string;
    status?:     $Enums.CatalogStatus;
    search?:     string;
    branchId?:   string;   // stock totals for this branch only
    locationId?: string;   // stock totals for this location only
    limit:       number;
    offset:      number;
};

const stockItemInclude = {
    item:         {
        select: {
            id: true, code: true, name: true, unit: true, status: true,
            category: { select: { id: true, name: true, kind: true } },
        },
    },
    medicine:     { select: { id: true, genericName: true, strength: true, dosageForm: true, route: true, legalCategory: true, controlled: true } },
    manufacturer: { select: { id: true, name: true } },
};

/** Units held per status, keyed by item (zero for statuses with none). */
type StockByStatus = Record<$Enums.StockStatus, number>;
const emptyStock = (): StockByStatus => ({ AVAILABLE: 0, QUARANTINE: 0, DAMAGED: 0 });

/**
 * Stocked items (PRD 15 §3.2): a billable the hospital holds in stock, with its medicine, maker and
 * packs (§4). Scoped to the caller's organisation.
 */
@Injectable()
export class StockItemsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Makes an item stocked, or updates its stock settings (§3.3). The item, the medicine and the
     * manufacturer being set are read in one round trip, then checked together.
     */
    async upsert(itemId: string, dto: StockItemDto, organizationId: string, userId: string) {
        const client = this.databaseService.client;
        const [item, medicine, manufacturer] = await client.$transaction([
            client.billableItem.findFirst({
                where:  { id: itemId, organizationId },
                select: { category: { select: { kind: true } }, stockItem: { select: { medicineId: true } } },
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
        });
        if (refusal) throw refusal.notFound ? new NotFoundException(refusal.reason) : new BadRequestException(refusal.reason);

        const data = { ...dto, storageCondition: dto.storageCondition as $Enums.StorageCondition | undefined };
        await client.stockItem.upsert({
            where:  { itemId },
            create: { ...data, itemId, organizationId, createdBy: userId },
            update: { ...data, updatedBy: userId },
        });
        return { message: item.stockItem ? 'Stock settings updated' : 'Item is now stocked' };
    }

    /**
     * Stocked items by name, paginated, each with its category, medicine, maker and the units held per
     * status (optionally for one branch or location). Which stock is usable (expiry, recalls) is
     * worked out by the stock views, not here.
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

    /** One stocked item with its medicine, maker, packs (active first, then by size) and units held per status. */
    async findOne(itemId: string, organizationId: string) {
        const item = await this.databaseService.client.stockItem.findFirst({
            where:   { itemId, organizationId },
            include: { ...stockItemInclude, packs: { orderBy: [{ status: 'asc' }, { unitsPerPack: 'asc' }] } },
        });
        if (!item) throw new NotFoundException(NOT_STOCKED);

        const stock = await this.stockByStatus(organizationId, [itemId], {});
        return { ...item, stock: stock.get(itemId) ?? emptyStock() };
    }

    // ── packs (§4) ───────────────────────────────────────────────────────────

    /** A new pack; a new default replaces the current one, in the same transaction. */
    async createPack(itemId: string, dto: CreateItemPackDto, organizationId: string, createdBy: string) {
        const { id } = await withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                await this.assertStocked(itemId, organizationId);
                if (dto.isDefault) await tx.itemPack.updateMany({ where: { itemId, isDefault: true }, data: { isDefault: false } });
                return tx.itemPack.create({ data: { ...dto, itemId, createdBy }, select: { id: true } });
            }),
            { conflict: PACK_CONFLICT },
        );
        return { id, message: 'Pack added' };
    }

    /** An item's packs: active first, then by size. A handful per item, so not paginated. */
    async findPacks(itemId: string, organizationId: string) {
        const client = this.databaseService.client;
        const [item, docs] = await client.$transaction([
            client.stockItem.findFirst({ where: { itemId, organizationId }, select: { itemId: true } }),
            client.itemPack.findMany({ where: { itemId }, orderBy: [{ status: 'asc' }, { unitsPerPack: 'asc' }] }),
        ]);
        if (!item) throw new NotFoundException(NOT_STOCKED);
        return { count: docs.length, docs };
    }

    /** Renames, re-barcodes, (de)activates or makes a pack the default. Its size never changes (§4). */
    async updatePack(packId: string, dto: UpdateItemPackDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const pack = await client.itemPack.findFirst({
            where:  { id: packId, stockItem: { organizationId } },
            select: { itemId: true, status: true, isDefault: true },
        });
        if (!pack) throw new NotFoundException('Pack not found');

        const after = packDefaultAfter(pack, dto);
        if ('reason' in after) throw new BadRequestException(after.reason);

        await withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const tx = this.databaseService.client;
                if (after.isDefault && !pack.isDefault) {
                    await tx.itemPack.updateMany({ where: { itemId: pack.itemId, isDefault: true }, data: { isDefault: false } });
                }
                await tx.itemPack.update({
                    where: { id: packId },
                    data:  { ...dto, status: dto.status as $Enums.CatalogStatus | undefined, isDefault: after.isDefault, updatedBy },
                });
            }),
            { conflict: PACK_CONFLICT },
        );
        return { message: 'Pack updated' };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async assertStocked(itemId: string, organizationId: string) {
        const item = await this.databaseService.client.stockItem.findFirst({ where: { itemId, organizationId }, select: { itemId: true } });
        if (!item) throw new NotFoundException(NOT_STOCKED);
    }

    /** Units held per item and status, in one grouped query. */
    private async stockByStatus(organizationId: string, itemIds: string[], scope: { branchId?: string; locationId?: string }) {
        const byItem = new Map<string, StockByStatus>();
        if (!itemIds.length) return byItem;

        const rows = await this.databaseService.client.stockBalance.groupBy({
            by:    ['itemId', 'status'],
            where: {
                organizationId,
                itemId:   { in: itemIds },
                quantity: { gt: 0 },
                ...(scope.branchId && { branchId: scope.branchId }),
                ...(scope.locationId && { locationId: scope.locationId }),
            },
            _sum:  { quantity: true },
        });
        for (const row of rows) {
            const stock = byItem.get(row.itemId) ?? emptyStock();
            stock[row.status] = row._sum.quantity ?? 0;
            byItem.set(row.itemId, stock);
        }
        return byItem;
    }
}
