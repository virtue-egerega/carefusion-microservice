import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateMedicineDto, UpdateMedicineDto } from '@shared/contracts/inventory';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { MedicineBodySystem, DosageForm, LegalCategory, MedicineRoute, MedicineSource } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../../generated/prisma/client';
import { MedicinesService } from './medicines.service';

@ApiTags('inventory')
@Controller('pharmacy')
export class MedicinesController {
    constructor(private readonly medicinesService: MedicinesService) {}

    @ApiOperation({
        summary: "Add a medicine that isn't in the seeded list (PRD 15 §3.1)",
        description: 'Visible only to this hospital, shown as USER_ADDED. 409 if it matches a seeded medicine or one of its own; '
            + '400 for an unknown therapeutic use code. Returns `{ id, message }`.',
    })
    @Authorize('pharmacy.medicine.manage')
    @Post('medicines')
    create(@Body() dto: CreateMedicineDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.medicinesService.create(dto, orgId, user.sub);
    }

    @ApiOperation({
        summary: "Seeded medicines and the hospital's own, by generic name, paginated",
        description: '`count` is the total matching the filters; `docs` is the page, each with `source` (SYSTEM or USER_ADDED) '
            + 'and its `therapeuticUses`.',
    })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the generic name, an alias or an ingredient, any case' })
    @ApiQuery({ name: 'therapeuticUse', required: false, description: 'A use code from GET /pharmacy/therapeutic-uses' })
    @ApiQuery({ name: 'dosageForm', enum: DosageForm, required: false })
    @ApiQuery({ name: 'route', enum: MedicineRoute, required: false })
    @ApiQuery({ name: 'bodySystem', enum: MedicineBodySystem, required: false })
    @ApiQuery({ name: 'legalCategory', enum: LegalCategory, required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'source', enum: MedicineSource, required: false })
    @Authorize('pharmacy.stock.view')
    @Get('medicines')
    findAll(
        @OrganizationId() orgId: string,
        @Query('search') search?: string,
        @Query('therapeuticUse') therapeuticUse?: string,
        @Query('dosageForm', new ParseEnumPipe(DosageForm, { optional: true })) dosageForm?: DosageForm,
        @Query('route', new ParseEnumPipe(MedicineRoute, { optional: true })) route?: MedicineRoute,
        @Query('bodySystem', new ParseEnumPipe(MedicineBodySystem, { optional: true })) bodySystem?: MedicineBodySystem,
        @Query('legalCategory', new ParseEnumPipe(LegalCategory, { optional: true })) legalCategory?: LegalCategory,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('source', new ParseEnumPipe(MedicineSource, { optional: true })) source?: MedicineSource,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.medicinesService.findAll(orgId, {
            search:         search?.trim() || undefined,
            therapeuticUse: therapeuticUse?.trim() || undefined,
            dosageForm:     dosageForm as $Enums.DosageForm | undefined,
            route:          route as $Enums.MedicineRoute | undefined,
            bodySystem:     bodySystem as $Enums.MedicineBodySystem | undefined,
            legalCategory:  legalCategory as $Enums.LegalCategory | undefined,
            status:         status as $Enums.CatalogStatus | undefined,
            source,
            limit,
            offset,
        });
    }

    // before medicines/:id, so "stats" isn't taken for an id
    @ApiOperation({
        summary: 'Medicine catalogue figures',
        description: '`total` active, `inactive`, `userAdded`, `stocked` (named by one of the hospital\'s products), `controlled`, and how many '
            + 'different `dosageForms`, `routes`, `legalCategories` and `therapeuticUses` the active medicines cover.',
    })
    @Authorize('pharmacy.stock.view')
    @Get('medicines/stats')
    stats(@OrganizationId() orgId: string) {
        return this.medicinesService.stats(orgId);
    }

    @ApiOperation({ summary: "A medicine with its therapeutic uses and the hospital's products of it" })
    @Authorize('pharmacy.stock.view')
    @Get('medicines/:id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.medicinesService.findOne(id, orgId);
    }

    @ApiOperation({
        summary: "Edit or deactivate one of the hospital's own medicines",
        description: '`therapeuticUses`, when given, replaces its uses. 403 for a seeded medicine; 409 if the new name, form and route match another.',
    })
    @Authorize('pharmacy.medicine.manage')
    @Patch('medicines/:id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateMedicineDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.medicinesService.update(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Every therapeutic use, by name', description: '`{ count, docs }`, each `{ id, code, name }`. Not paginated.' })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, any case' })
    @Authorize('pharmacy.stock.view')
    @Get('therapeutic-uses')
    findUses(@Query('search') search?: string) {
        return this.medicinesService.findUses(search?.trim() || undefined);
    }
}
