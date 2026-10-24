import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import {
    CreateManufacturerDto, CreateSupplierDto, UpdateManufacturerDto, UpdateSupplierDto,
} from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { $Enums } from '../../../generated/prisma/client';
import { SuppliersService } from './suppliers.service';
import { ManufacturersService } from './manufacturers.service';

const listQuery = (search?: string, status?: CatalogStatus, limit = 20, offset = 0) => ({
    search: search?.trim() || undefined,
    status: status as $Enums.CatalogStatus | undefined,
    limit,
    offset,
});

/** Suppliers and manufacturers (PRD 15 §5): the hospital's own lists, picked from or added to while working. */
@ApiTags('inventory')
@Controller('inventory')
export class SuppliersController {
    constructor(
        private readonly suppliersService: SuppliersService,
        private readonly manufacturersService: ManufacturersService,
    ) {}

    // ── suppliers ────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Add a supplier', description: 'Returns `{ id, message }`. 409 if the name is taken.' })
    @Authorize('inventory.supplier.manage')
    @Post('suppliers')
    createSupplier(@Body() dto: CreateSupplierDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.suppliersService.create(dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Suppliers by name, paginated', description: '`count` is the total matching the filters; `docs` is the page.' })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, any case' })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @Authorize('inventory.view')
    @Get('suppliers')
    findSuppliers(
        @OrganizationId() orgId: string,
        @Query('search') search?: string,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.suppliersService.findAll(orgId, listQuery(search, status, limit, offset));
    }

    @ApiOperation({ summary: 'One supplier', description: '`createdBy` / `updatedBy` are the users, or null.' })
    @Authorize('inventory.view')
    @Get('suppliers/:id')
    findSupplier(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.suppliersService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Edit or deactivate a supplier' })
    @Authorize('inventory.supplier.manage')
    @Patch('suppliers/:id')
    updateSupplier(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateSupplierDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.suppliersService.update(id, dto, orgId, user.sub);
    }

    // ── manufacturers ────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Add a manufacturer', description: 'Returns `{ id, message }`. 409 if the name is taken.' })
    @Authorize('inventory.supplier.manage')
    @Post('manufacturers')
    createManufacturer(@Body() dto: CreateManufacturerDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.manufacturersService.create(dto, orgId, user.sub);
    }

    @ApiOperation({
        summary: 'Manufacturers by name, paginated, with their product counts',
        description: '`count` is the total matching the filters; `docs` is the page.',
    })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, any case' })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @Authorize('inventory.view')
    @Get('manufacturers')
    findManufacturers(
        @OrganizationId() orgId: string,
        @Query('search') search?: string,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.manufacturersService.findAll(orgId, listQuery(search, status, limit, offset));
    }

    @ApiOperation({ summary: 'One manufacturer with its product count' })
    @Authorize('inventory.view')
    @Get('manufacturers/:id')
    findManufacturer(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.manufacturersService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Edit or deactivate a manufacturer' })
    @Authorize('inventory.supplier.manage')
    @Patch('manufacturers/:id')
    updateManufacturer(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateManufacturerDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.manufacturersService.update(id, dto, orgId, user.sub);
    }
}
