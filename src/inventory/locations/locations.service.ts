import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateStorageLocationDto, UpdateStorageLocationDto } from '@shared/contracts/inventory';
import { loadActors, withActors } from '../../billables/actors';
import { locationUpdateRefusal } from './locations.rules';

const CONFLICT = 'A storage location with this code already exists';

export type LocationsQuery = {
    branchId?: string;
    type?:     $Enums.LocationType;
    status?:   $Enums.CatalogStatus;
    search?:   string;
    limit:     number;
    offset:    number;
};

/** Where stock is kept (PRD 15 §7): flat per branch in v1. Scoped to the caller's organisation. */
@Injectable()
export class LocationsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** In the given branch, or the caller's own. The branch must be the organisation's (an FK can't check that). */
    async create(dto: CreateStorageLocationDto, organizationId: string, callerBranchId: string | null, createdBy: string) {
        const branchId = dto.branchId ?? callerBranchId;
        if (!branchId) throw new BadRequestException('Choose the branch this location is in');

        const branch = await this.databaseService.client.branch.findFirst({
            where:  { id: branchId, organizationId, deletedAt: null },
            select: { id: true },
        });
        if (!branch) throw new NotFoundException('Branch not found');

        const { id } = await withConstraintErrors(
            () => this.databaseService.client.storageLocation.create({
                data: {
                    ...dto,
                    branchId,
                    type:             dto.type as $Enums.LocationType,
                    storageCondition: dto.storageCondition as $Enums.StorageCondition | undefined,
                    organizationId,
                    createdBy,
                },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Storage location created' };
    }

    /** By branch, then name. */
    async findAll(organizationId: string, query: LocationsQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.branchId && { branchId: query.branchId }),
            ...(query.type && { type: query.type }),
            ...(query.status && { status: query.status }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' as const } },
                    { code: { contains: query.search, mode: 'insensitive' as const } },
                ],
            }),
        };

        const [count, docs] = await client.$transaction([
            client.storageLocation.count({ where }),
            client.storageLocation.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
                include: { branch: { select: { id: true, name: true } } },
            }),
        ]);
        return { count, docs };
    }

    /** One location with its branch and the units of stock it holds (all statuses). */
    async findOne(locationId: string, organizationId: string) {
        const client = this.databaseService.client;
        const [location, held] = await client.$transaction([
            client.storageLocation.findFirst({
                where:   { id: locationId, organizationId },
                include: { branch: { select: { id: true, name: true } } },
            }),
            client.stockBalance.aggregate({ where: { locationId, organizationId }, _sum: { quantity: true } }),
        ]);
        if (!location) throw new NotFoundException('Storage location not found');

        const actors = await loadActors(this.databaseService, [location.createdBy, location.updatedBy]);
        return { ...withActors(location, actors), stockHeld: held._sum.quantity ?? 0 };
    }

    /**
     * One conditional update: deactivating needs the location to hold no stock (§7.1). Only when
     * nothing matched is the location read, to say why.
     */
    async update(locationId: string, dto: UpdateStorageLocationDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const deactivating = dto.status === 'INACTIVE';

        const { count } = await withConstraintErrors(
            () => client.storageLocation.updateMany({
                where: {
                    id: locationId, organizationId,
                    ...(deactivating && { balances: { none: { quantity: { gt: 0 } } } }),
                },
                data: {
                    ...dto,
                    type:             dto.type as $Enums.LocationType | undefined,
                    storageCondition: dto.storageCondition as $Enums.StorageCondition | undefined,
                    status:           dto.status as $Enums.CatalogStatus | undefined,
                    updatedBy,
                },
            }),
            { conflict: CONFLICT },
        );

        if (!count) {
            const [found, held] = await client.$transaction([
                client.storageLocation.findFirst({ where: { id: locationId, organizationId }, select: { id: true } }),
                client.stockBalance.aggregate({ where: { locationId, organizationId }, _sum: { quantity: true } }),
            ]);
            const reason = locationUpdateRefusal(found && { stockHeld: held._sum.quantity ?? 0 }, deactivating);
            throw found ? new ConflictException(reason) : new NotFoundException(reason);
        }
        return { message: 'Storage location updated' };
    }
}
