import {
    Body, Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreateItemUnitDto, UpdateItemUnitDto } from '@shared/contracts/billables';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { $Enums } from '../../../generated/prisma/client';
import { ItemUnitsService } from './item-units.service';

enum UnitUseQuery { SELLING = 'SELLING', PURCHASE = 'PURCHASE' }

/** Item units (PRD 15 §4.1): what items are sold and bought in, seeded and extendable by the hospital. */
@ApiTags('billables')
@Controller('billables/item-units')
export class ItemUnitsController {
    constructor(private readonly itemUnitsService: ItemUnitsService) {}

    @ApiOperation({
        summary: `Item units by name, for the pickers`,
        description: `The seeded units and the hospital's own (\`source\`: SYSTEM / USER_ADDED). \`kind=PHARMACY&use=SELLING\` gives the ` +
        `pharmacy's selling units, \`kind=LABORATORY\` the lab's. \`count\` is the total matching the filters; \`docs\` is the page.`,
    })
    @ApiQuery({ name: 'kind', enum: ServiceCategory, required: false })
    @ApiQuery({ name: 'use', enum: UnitUseQuery, required: false })
    @ApiQuery({ name: 'status', enum: CatalogStatus, required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name or plural, any case' })
    @Authorize('billable.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('kind', new ParseEnumPipe(ServiceCategory, { optional: true })) kind?: ServiceCategory,
        @Query('use', new ParseEnumPipe(UnitUseQuery, { optional: true })) use?: UnitUseQuery,
        @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true })) status?: CatalogStatus,
        @Query('search') search?: string,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.itemUnitsService.findAll(orgId, {
            kind:   kind as $Enums.ServiceCategory | undefined,
            use,
            status: status as $Enums.CatalogStatus | undefined,
            search: search?.trim() || undefined,
            limit,
            offset,
        });
    }

    @ApiOperation({
        summary: `Add one of the hospital's own units`,
        description: `For a unit the seeded list doesn't have. 409 if it's already a seeded unit or the hospital's own. Returns \`{ id, message }\`.`,
    })
    @Authorize('billable.item.create')
    @Post()
    create(@Body() dto: CreateItemUnitDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.itemUnitsService.create(dto, orgId, user.sub);
    }

    @ApiOperation({ summary: `Edit or deactivate one of the hospital's own units`, description: `Seeded units can't be changed.` })
    @Authorize('billable.item.update')
    @Patch(':id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemUnitDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.itemUnitsService.update(id, dto, orgId, user.sub);
    }
}
