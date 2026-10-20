import { Controller, DefaultValuePipe, Get, Param, ParseBoolPipe, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, OrganizationId } from '../../auth/auth.decorators';
import { ChargesService } from './charges.service';

@ApiTags('charges')
@Controller('charges')
export class ChargesController {
    constructor(private readonly chargesService: ChargesService) {}

    @ApiOperation({
        summary: "A patient's charges, newest first, with what they owe",
        description: "Each charge has `patientShare` { amount, paid, outstanding, paymentStatus }: what the patient's own account owes for it (insurer shares excluded). `outstanding` at the top is the patient's total still owed. Pay with POST /billing-accounts/:id/deposits.",
    })
    @ApiQuery({ name: 'encounterId', required: false, description: "Only this visit's charges" })
    @ApiQuery({ name: 'unpaid', required: false, type: Boolean, description: 'Only charges still owed' })
    @Authorize('billing.view')
    @Get('patients/:patientId')
    findByPatientId(
        @Param('patientId', ParseUUIDPipe) patientId: string,
        @OrganizationId() orgId: string,
        @Query('encounterId', new ParseUUIDPipe({ optional: true })) encounterId?: string,
        @Query('unpaid', new ParseBoolPipe({ optional: true })) unpaid?: boolean,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.chargesService.findByPatientId(orgId, patientId, { encounterId, unpaid, limit, offset });
    }
}
