import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateBillableCategoryDto, UpdateBillableCategoryDto } from '@shared/contracts/billables';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { $Enums } from '../../../generated/prisma/client';
import { BillableCategoriesService } from './billable-categories.service';

@ApiTags('billables')
@Controller('billables/categories')
export class BillableCategoriesController {
    constructor(private readonly categoriesService: BillableCategoriesService) {}

    @ApiOperation({ summary: 'Create a billable category: a hospital name plus a system kind (PRD 12 §3)' })
    @Authorize('billable.category.create')
    @Post()
    create(@Body() dto: CreateBillableCategoryDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.categoriesService.create(dto, orgId, user.sub);
    }

    @ApiOperation({
        summary: 'Billable categories by name, paginated, with their item counts',
        description: '`count` is the total matching the filters; `docs` is the page.',
    })
    @ApiQuery({ name: 'kind', enum: ServiceCategory, required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, any case' })
    @Authorize('billable.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('kind', new ParseEnumPipe(ServiceCategory, { optional: true })) kind?: ServiceCategory,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.categoriesService.findAll(orgId, {
            kind:   kind as $Enums.ServiceCategory | undefined,
            status: status as $Enums.CatalogStatus | undefined,
            search: search?.trim() || undefined,
            limit,
            offset,
        });
    }

    @ApiOperation({ summary: "Rename, describe or deactivate a category; `kind` only changes while it has no items" })
    @Authorize('billable.category.update')
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateBillableCategoryDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.categoriesService.update(id, dto, orgId, user.sub);
    }
}
