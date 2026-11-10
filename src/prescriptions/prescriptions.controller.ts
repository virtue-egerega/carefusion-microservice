import { Controller, DefaultValuePipe, Get, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, OrganizationId } from '../auth/auth.decorators';
import { DosageForm, LegalCategory, MedicineBodySystem, MedicineRoute } from '@shared/enums/inventory/inventory.enums';
import { $Enums } from '../../generated/prisma/client';
import { PrescriptionsService } from './prescriptions.service';

@ApiTags('prescriptions')
@Controller('prescriptions')
export class PrescriptionsController {
    constructor(private readonly prescriptionsService: PrescriptionsService) {}

    @ApiOperation({
        summary: 'Find a medicine to prescribe (PRD 16 §3)',
        description: 'Every active medicine, seeded or the hospital\'s own, whether or not the hospital holds it: stock and billing '
            + 'are the dispensary\'s concern. `{ count, docs }`, each `{ id, genericName, strength, dosageForm, route, legalCategory, '
            + 'controlled, therapeuticUses: [{ code, name }] }`.',
    })
    @ApiQuery({ name: 'search', required: false, description: 'Part of the name, strength, an alias, an ingredient or a therapeutic use name ("malaria"), any case' })
    @ApiQuery({ name: 'therapeuticUse', required: false, description: 'A use code from GET /pharmacy/medicines/therapeutic-uses' })
    @ApiQuery({ name: 'dosageForm', enum: DosageForm, required: false })
    @ApiQuery({ name: 'route', enum: MedicineRoute, required: false })
    @ApiQuery({ name: 'bodySystem', enum: MedicineBodySystem, required: false })
    @ApiQuery({ name: 'legalCategory', enum: LegalCategory, required: false })
    @ApiQuery({ name: 'controlled', type: Boolean, required: false })
    @Authorize('prescription.create')
    @Get('medicines')
    findMedicines(
        @OrganizationId() orgId: string,
        @Query('search') search?: string,
        @Query('therapeuticUse') therapeuticUse?: string,
        @Query('dosageForm', new ParseEnumPipe(DosageForm, { optional: true })) dosageForm?: DosageForm,
        @Query('route', new ParseEnumPipe(MedicineRoute, { optional: true })) route?: MedicineRoute,
        @Query('bodySystem', new ParseEnumPipe(MedicineBodySystem, { optional: true })) bodySystem?: MedicineBodySystem,
        @Query('legalCategory', new ParseEnumPipe(LegalCategory, { optional: true })) legalCategory?: LegalCategory,
        @Query('controlled', new ParseBoolPipe({ optional: true })) controlled?: boolean,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.prescriptionsService.findMedicines(orgId, {
            search:         search?.trim() || undefined,
            therapeuticUse: therapeuticUse?.trim() || undefined,
            dosageForm:     dosageForm as $Enums.DosageForm | undefined,
            route:          route as $Enums.MedicineRoute | undefined,
            bodySystem:     bodySystem as $Enums.MedicineBodySystem | undefined,
            legalCategory:  legalCategory as $Enums.LegalCategory | undefined,
            controlled,
            limit,
            offset,
        });
    }
}
