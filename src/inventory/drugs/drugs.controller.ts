import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateDrugDto, UpdateDrugDto } from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { DosageForm, DrugRoute, DrugSource } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { DrugsService } from './drugs.service';

@ApiTags('inventory')
@Controller('inventory/drugs')
export class DrugsController {
    constructor(private readonly drugsService: DrugsService) {}

    @ApiOperation({
        summary: "Add a drug that isn't in the system list (PRD 15 §3.1)",
        description: 'Visible only to this hospital. 409 if it matches a system drug or one of its own. Returns `{ id, message }`.',
    })
    @Authorize('inventory.drug.manage')
    @Post()
    create(@Body() dto: CreateDrugDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.drugsService.create(dto, orgId, user.sub);
    }

    @ApiOperation({
        summary: "System drugs and the hospital's own, by generic name, paginated",
        description: '`count` is the total matching the filters; `docs` is the page, each with `source` (SYSTEM or HOSPITAL).',
    })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the generic name, any case' })
    @ApiQuery({ name: 'dosageForm', enum: DosageForm, required: false })
    @ApiQuery({ name: 'route', enum: DrugRoute, required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'source', enum: DrugSource, required: false })
    @Authorize('inventory.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('search') search?: string,
        @Query('dosageForm', new ParseEnumPipe(DosageForm, { optional: true })) dosageForm?: DosageForm,
        @Query('route', new ParseEnumPipe(DrugRoute, { optional: true })) route?: DrugRoute,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('source', new ParseEnumPipe(DrugSource, { optional: true })) source?: DrugSource,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.drugsService.findAll(orgId, {
            search:     search?.trim() || undefined,
            dosageForm: dosageForm as $Enums.DosageForm | undefined,
            route:      route as $Enums.DrugRoute | undefined,
            status:     status as $Enums.CatalogStatus | undefined,
            source,
            limit,
            offset,
        });
    }

    @ApiOperation({ summary: "A drug with the hospital's products of it" })
    @Authorize('inventory.view')
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.drugsService.findOne(id, orgId);
    }

    @ApiOperation({ summary: "Edit or deactivate one of the hospital's own drugs", description: '403 for a system drug.' })
    @Authorize('inventory.drug.manage')
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateDrugDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.drugsService.update(id, dto, orgId, user.sub);
    }
}
