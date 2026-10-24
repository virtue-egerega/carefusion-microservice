import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateStorageLocationDto, UpdateStorageLocationDto } from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { LocationType } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { LocationsService } from './locations.service';

@ApiTags('inventory')
@Controller('inventory/locations')
export class LocationsController {
    constructor(private readonly locationsService: LocationsService) {}

    @ApiOperation({
        summary: 'Add a storage location: a store, dispensary, ward… (PRD 15 §7)',
        description: "In `branchId`, or the caller's branch. Returns `{ id, message }`. 409 if the code is taken.",
    })
    @Authorize('inventory.location.manage')
    @Post()
    create(@Body() dto: CreateStorageLocationDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.locationsService.create(dto, orgId, user.branchId, user.sub);
    }

    @ApiOperation({
        summary: 'Storage locations by branch and name, paginated',
        description: '`count` is the total matching the filters; `docs` is the page, each with its branch.',
    })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'type', enum: LocationType, required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name or code, any case' })
    @Authorize('inventory.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('type', new ParseEnumPipe(LocationType, { optional: true })) type?: LocationType,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.locationsService.findAll(orgId, {
            branchId,
            type:   type as $Enums.LocationType | undefined,
            status: status as $Enums.CatalogStatus | undefined,
            search: search?.trim() || undefined,
            limit,
            offset,
        });
    }

    @ApiOperation({ summary: 'One storage location with its branch and `stockHeld` (units, all statuses)' })
    @Authorize('inventory.view')
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.locationsService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Edit or deactivate a storage location', description: '409 when deactivating a location that still holds stock.' })
    @Authorize('inventory.location.manage')
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateStorageLocationDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.locationsService.update(id, dto, orgId, user.sub);
    }
}
