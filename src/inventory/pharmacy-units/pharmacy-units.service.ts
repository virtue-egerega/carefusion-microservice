import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreatePharmacyUnitDto, UpdatePharmacyUnitDto } from '@shared/contracts/inventory';
import { loadActors, withActors } from '../../billables/actors';
import { pharmacyUnitUpdateRefusal } from './pharmacy-units.rules';

const CONFLICT = 'A pharmacy unit with this code already exists';

export type PharmacyUnitsQuery = {
    branchId?: string;
    type?:     $Enums.PharmacyUnitType;
    status?:   $Enums.CatalogStatus;
    search?:   string;
    limit:     number;
    offset:    number;
};

/** Pharmacy units (PRD 15 §7): a branch's store and its dispensaries. Scoped to the caller's organisation. */
@Injectable()
export class PharmacyUnitsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** In the given branch, or the caller's own. The branch must be the organisation's (an FK can't check that). */
    async create(dto: CreatePharmacyUnitDto, organizationId: string, callerBranchId: string | null, createdBy: string) {
        const branchId = dto.branchId ?? callerBranchId;
        if (!branchId) throw new BadRequestException('Choose the branch this pharmacy unit is in');

        const branch = await this.databaseService.client.branch.findFirst({
            where:  { id: branchId, organizationId, deletedAt: null },
            select: { id: true },
        });
        if (!branch) throw new NotFoundException('Branch not found');

        const { id } = await withConstraintErrors(
            () => this.databaseService.client.pharmacyUnit.create({
                data: {
                    ...dto,
                    branchId,
                    type:           dto.type as $Enums.PharmacyUnitType,
                    organizationId,
                    createdBy,
                },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Pharmacy unit created' };
    }

    /** By branch, then name. */
    async findAll(organizationId: string, query: PharmacyUnitsQuery) {
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
            client.pharmacyUnit.count({ where }),
            client.pharmacyUnit.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
                include: { branch: { select: { id: true, name: true } } },
            }),
        ]);
        return { count, docs };
    }

    /** One pharmacy unit with its branch and the selling units of stock it holds (all statuses). */
    async findOne(pharmacyUnitId: string, organizationId: string) {
        const client = this.databaseService.client;
        const [pharmacyUnit, held] = await client.$transaction([
            client.pharmacyUnit.findFirst({
                where:   { id: pharmacyUnitId, organizationId },
                include: { branch: { select: { id: true, name: true } } },
            }),
            client.stockBalance.aggregate({ where: { pharmacyUnitId, organizationId }, _sum: { sellingUnitQuantity: true } }),
        ]);
        if (!pharmacyUnit) throw new NotFoundException('Pharmacy unit not found');

        const actors = await loadActors(this.databaseService, [pharmacyUnit.createdBy, pharmacyUnit.updatedBy]);
        return { ...withActors(pharmacyUnit, actors), stockHeld: Number(held._sum.sellingUnitQuantity ?? 0) };
    }

    /**
     * One conditional update: deactivating needs the unit to hold no stock (§7.1). Only when
     * nothing matched is the unit read, to say why.
     */
    async update(pharmacyUnitId: string, dto: UpdatePharmacyUnitDto, organizationId: string, updatedBy: string) {
        const client = this.databaseService.client;
        const deactivating = dto.status === 'INACTIVE';

        const { count } = await withConstraintErrors(
            () => client.pharmacyUnit.updateMany({
                where: {
                    id: pharmacyUnitId, organizationId,
                    ...(deactivating && { balances: { none: { sellingUnitQuantity: { gt: 0 } } } }),
                },
                data: {
                    ...dto,
                    type:   dto.type as $Enums.PharmacyUnitType | undefined,
                    status: dto.status as $Enums.CatalogStatus | undefined,
                    updatedBy,
                },
            }),
            { conflict: CONFLICT },
        );

        if (!count) {
            const [found, held] = await client.$transaction([
                client.pharmacyUnit.findFirst({ where: { id: pharmacyUnitId, organizationId }, select: { id: true } }),
                client.stockBalance.aggregate({ where: { pharmacyUnitId, organizationId }, _sum: { sellingUnitQuantity: true } }),
            ]);
            const reason = pharmacyUnitUpdateRefusal(found && { stockHeld: Number(held._sum.sellingUnitQuantity ?? 0) }, deactivating);
            throw found ? new ConflictException(reason) : new NotFoundException(reason);
        }
        return { message: 'Pharmacy unit updated' };
    }
}
