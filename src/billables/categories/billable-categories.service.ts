import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreateBillableCategoryDto, UpdateBillableCategoryDto } from '@shared/contracts/billables';
import { categoryUpdateRefusal } from './categories.rules';
import { loadActors, withActors } from '../actors';

const CONFLICT = 'A billable category with this name already exists';

export type CategoriesQuery = {
    kind?:   $Enums.ServiceCategory;
    status?: $Enums.CatalogStatus;
    search?: string;
    limit:   number;
    offset:  number;
};

/** Hospital-defined billable categories (PRD 12 §3). Scoped to the caller's organisation. */
@Injectable()
export class BillableCategoriesService {
    constructor(private readonly databaseService: DatabaseService) {}

    async create(dto: CreateBillableCategoryDto, organizationId: string, createdBy: string) {
        return withConstraintErrors(
            () => this.databaseService.client.billableCategory.create({
                data: { ...dto, kind: dto.kind as $Enums.ServiceCategory, organizationId, createdBy },
            }),
            { conflict: CONFLICT },
        );
    }

    async findAll(organizationId: string, query: CategoriesQuery) {
        const client = this.databaseService.client;
        const where = {
            organizationId,
            ...(query.kind && { kind: query.kind }),
            ...(query.status && { status: query.status }),
            ...(query.search && { name: { contains: query.search, mode: 'insensitive' as const } }),
        };

        const [count, docs] = await client.$transaction([
            client.billableCategory.count({ where }),
            client.billableCategory.findMany({
                where,
                take:    query.limit,
                skip:    query.offset,
                orderBy: { name: 'asc' },
                include: { _count: { select: { items: true } } },
            }),
        ]);
        return { count, docs };
    }

    /**
     * One conditional update: `kind` only changes while the category has no items (§3.2).
     * Only when nothing matched is the category read, to say why.
     */
    /** One category with its item counts and the users who created and last updated it. */
    async findOne(categoryId: string, organizationId: string) {
        const category = await this.databaseService.client.billableCategory.findFirst({
            where:   { id: categoryId, organizationId },
        });
        if (!category) throw new NotFoundException('Billable category not found');

        const actors = await loadActors(this.databaseService, [category.createdBy, category.updatedBy]);
        return withActors(category, actors);
    }

    async update(categoryId: string, dto: UpdateBillableCategoryDto, organizationId: string, updatedBy: string) {
        const kindChanging = dto.kind !== undefined;
        const { count } = await withConstraintErrors(
            () => this.databaseService.client.billableCategory.updateMany({
                where: {
                    id: categoryId, organizationId,
                    // changing to the same kind is harmless, so only a different kind needs an empty category
                    ...(kindChanging && { OR: [{ kind: dto.kind as $Enums.ServiceCategory }, { items: { none: {} } }] }),
                },
                data: {
                    ...dto,
                    kind:   dto.kind as $Enums.ServiceCategory | undefined,
                    status: dto.status as $Enums.CatalogStatus | undefined,
                    updatedBy,
                },
            }),
            { conflict: CONFLICT },
        );

        if (!count) {
            const found = await this.databaseService.client.billableCategory.findFirst({
                where:  { id: categoryId, organizationId },
                select: { _count: { select: { items: true } } },
            });
            const reason = categoryUpdateRefusal(found && { itemCount: found._count.items }, kindChanging);
            throw found ? new ConflictException(reason) : new NotFoundException(reason);
        }
        return { message: 'Billable category updated' };
    }
}
