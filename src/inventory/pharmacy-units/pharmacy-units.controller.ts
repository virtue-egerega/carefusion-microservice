import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreatePharmacyUnitDto, UpdatePharmacyUnitDto } from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { PharmacyUnitType } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { PharmacyUnitsService } from './pharmacy-units.service';

@ApiTags('inventory')
@Controller('pharmacy/units')
export class PharmacyUnitsController {
    constructor(private readonly pharmacyUnitsService: PharmacyUnitsService) {}

    @ApiOperation({
        summary: `Add a pharmacy unit: a store or a dispensary (PRD 15 §7)`,
        description: `In \`branchId\`, or the caller's branch. Returns \`{ id, message }\`. 409 if the code is taken.`,
    })
    @Authorize('pharmacy.unit.manage')
    @Post()
    create(@Body() dto: CreatePharmacyUnitDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.pharmacyUnitsService.create(dto, orgId, user.branchId, user.sub);
    }

    @ApiOperation({
        summary: `Pharmacy units by branch and name, paginated`,
        description: `\`count\` is the total matching the filters; \`docs\` is the page, each with its branch.`,
    })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'type', enum: PharmacyUnitType, required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name or code, any case' })
    @Authorize()
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('branchId', new ParseUUIDPipe({ optional: true })) branchId?: string,
        @Query('type', new ParseEnumPipe(PharmacyUnitType, { optional: true })) type?: PharmacyUnitType,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.pharmacyUnitsService.findAll(orgId, {
            branchId,
            type:   type as $Enums.PharmacyUnitType | undefined,
            status: status as $Enums.CatalogStatus | undefined,
            search: search?.trim() || undefined,
            limit,
            offset,
        });
    }

    @ApiOperation({ summary: `One pharmacy unit with its branch and \`stockHeld\` (selling units, all statuses)` })
    @Authorize('pharmacy.stock.view')
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.pharmacyUnitsService.findOne(id, orgId);
    }

    @ApiOperation({ summary: `Edit or deactivate a pharmacy unit`, description: `409 when deactivating a unit that still holds stock.` })
    @Authorize('pharmacy.unit.manage')
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdatePharmacyUnitDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.pharmacyUnitsService.update(id, dto, orgId, user.sub);
    }
}
