import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateManufacturerDto, UpdateManufacturerDto } from '@shared/contracts/inventory';
import { loadActors, withActors } from '../../billables/actors';
import type { PartyQuery } from './suppliers.service';

const CONFLICT = 'A manufacturer with this name already exists';

/** Who makes the hospital's products (PRD 15 §5): picked or created when stocking an item. */
@Injectable()
export class ManufacturersService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: CreateManufacturerDto, organizationId: string, createdBy: string) {
        const { id } = await withConstraintErrors(
            () => this.databaseService.client.manufacturer.create({
                data:   { ...dto, organizationId, createdBy },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Manufacturer created' };
    }

    /** By name, with how many of the hospital's products each makes. */
    async findAll(organizationId: string, query: PartyQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.status && { status: query.status }),
            ...(query.search && { name: { contains: query.search, mode: 'insensitive' as const } }),
        };

        const [count, docs] = await client.$transaction([
            client.manufacturer.count({ where }),
            client.manufacturer.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { name: 'asc' },
                include: { _count: { select: { stockItems: true } } },
            }),
        ]);
        return { count, docs };
    }

    async findOne(manufacturerId: string, organizationId: string) {
        const manufacturer = await this.databaseService.client.manufacturer.findFirst({
            where:   { id: manufacturerId, organizationId },
            include: { _count: { select: { stockItems: true } } },
        });
        if (!manufacturer) throw new NotFoundException('Manufacturer not found');

        const actors = await loadActors(this.databaseService, [manufacturer.createdBy, manufacturer.updatedBy]);
        return withActors(manufacturer, actors);
    }

    async update(manufacturerId: string, dto: UpdateManufacturerDto, organizationId: string, updatedBy: string) {
        const { count } = await withConstraintErrors(
            () => this.databaseService.client.manufacturer.updateMany({
                where: { id: manufacturerId, organizationId },
                data:  { ...dto, status: dto.status as $Enums.CatalogStatus | undefined, updatedBy },
            }),
            { conflict: CONFLICT },
        );
        if (!count) throw new NotFoundException('Manufacturer not found');
        return { message: 'Manufacturer updated' };
    }
}
