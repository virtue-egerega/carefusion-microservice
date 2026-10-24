import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateSupplierDto, UpdateSupplierDto } from '@shared/contracts/inventory';
import { loadActors, withActors } from '../../billables/actors';

const CONFLICT = 'A supplier with this name already exists';

export type PartyQuery = {
    search?: string;
    status?: $Enums.CatalogStatus;
    limit:   number;
    offset:  number;
};

/** Who the hospital buys from (PRD 15 §5). Scoped to the caller's organisation. */
@Injectable()
export class SuppliersService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: CreateSupplierDto, organizationId: string, createdBy: string) {
        const { id } = await withConstraintErrors(
            () => this.databaseService.client.supplier.create({
                data:   { ...dto, organizationId, createdBy },
                select: { id: true },
            }),
            { conflict: CONFLICT },
        );
        return { id, message: 'Supplier created' };
    }

    async findAll(organizationId: string, query: PartyQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.status && { status: query.status }),
            ...(query.search && { name: { contains: query.search, mode: 'insensitive' as const } }),
        };

        const [count, docs] = await client.$transaction([
            client.supplier.count({ where }),
            client.supplier.findMany({ where, take: query.limit, skip: query.offset, orderBy: { name: 'asc' } }),
        ]);
        return { count, docs };
    }

    async findOne(supplierId: string, organizationId: string) {
        const supplier = await this.databaseService.client.supplier.findFirst({ where: { id: supplierId, organizationId } });
        if (!supplier) throw new NotFoundException('Supplier not found');

        const actors = await loadActors(this.databaseService, [supplier.createdBy, supplier.updatedBy]);
        return withActors(supplier, actors);
    }

    async update(supplierId: string, dto: UpdateSupplierDto, organizationId: string, updatedBy: string) {
        const { count } = await withConstraintErrors(
            () => this.databaseService.client.supplier.updateMany({
                where: { id: supplierId, organizationId },
                data:  { ...dto, status: dto.status as $Enums.CatalogStatus | undefined, updatedBy },
            }),
            { conflict: CONFLICT },
        );
        if (!count) throw new NotFoundException('Supplier not found');
        return { message: 'Supplier updated' };
    }
}
