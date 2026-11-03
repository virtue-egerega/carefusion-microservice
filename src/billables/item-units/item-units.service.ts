import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateItemUnitDto, UpdateItemUnitDto } from '@shared/contracts/billables';

const CONFLICT = 'A unit with this name already exists';

export type ItemUnitsQuery = {
    kind?:   $Enums.ServiceCategory;   // units for this kind of item
    use?:    'SELLING' | 'PURCHASE';
    status?: $Enums.CatalogStatus;
    search?: string;
    limit:   number;
    offset:  number;
};

/**
 * Item units (PRD 15 §4.1): what items are sold and bought in. The seeded units and the hospital's own,
 * each with `source` (SYSTEM / USER_ADDED). Hospitals add and edit their own; seeded units can't be changed.
 */
@Injectable()
export class ItemUnitsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** By name, for the pickers: the units offered for `kind` and `use`. */
    async findAll(organizationId: string, query: ItemUnitsQuery) {
        const client = this.databaseService.client;
        const where = {
            OR: [{ organizationId: null }, { organizationId }],
            ...(query.kind && { kinds: { has: query.kind } }),
            ...(query.use === 'SELLING' && { usedForSelling: true }),
            ...(query.use === 'PURCHASE' && { usedForPurchase: true }),
            ...(query.status && { status: query.status }),
            ...(query.search && {
                AND: [{
                    OR: [
                        { name: { contains: query.search, mode: 'insensitive' as const } },
                        { pluralName: { contains: query.search, mode: 'insensitive' as const } },
                    ],
                }],
            }),
        };

        const [count, units] = await client.$transaction([
            client.itemUnit.count({ where }),
            client.itemUnit.findMany({ where, take: query.limit, skip: query.offset, orderBy: { name: 'asc' } }),
        ]);
        return { count, docs: units.map(u => ({ ...u, source: u.organizationId ? 'USER_ADDED' : 'SYSTEM' })) };
    }

    /** A unit of the hospital's own. Refused (409) if it has the name of a seeded or own unit. */
    async create(dto: CreateItemUnitDto, organizationId: string, createdBy: string) {
        const client = this.databaseService.client;
        const seeded = await client.itemUnit.findFirst({
            where:  { organizationId: null, name: { equals: dto.name.trim(), mode: 'insensitive' } },
            select: { id: true },
        });
        if (seeded) throw new ConflictException(`${dto.name.trim()} is already a unit; pick it instead`);

        const { id } = await withConstraintErrors(
            () => client.itemUnit.create({
                data: {
                    ...dto,
                    name:       dto.name.trim(),
                    pluralName: dto.pluralName?.trim() || dto.name.trim(),
                    kinds:      dto.kinds as $Enums.ServiceCategory[],
                    organizationId,
                    createdBy,
                },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Unit added' };
    }

    /** Edits or deactivates one of the hospital's own units; seeded units are 404 here. */
    async update(itemUnitId: string, dto: UpdateItemUnitDto, organizationId: string, updatedBy: string) {
        const { count } = await withConstraintErrors(
            () => this.databaseService.client.itemUnit.updateMany({
                where: { id: itemUnitId, organizationId },
                data:  {
                    ...dto,
                    name:       dto.name?.trim(),
                    pluralName: dto.pluralName?.trim(),
                    kinds:      dto.kinds as $Enums.ServiceCategory[] | undefined,
                    status:     dto.status as $Enums.CatalogStatus | undefined,
                    updatedBy,
                },
            }),
            { conflict: CONFLICT },
        );
        if (!count) throw new NotFoundException("Unit not found among the hospital's own (seeded units can't be changed)");
        return { message: 'Unit updated' };
    }
}
