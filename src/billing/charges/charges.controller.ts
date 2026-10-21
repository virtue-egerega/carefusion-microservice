import { Controller, DefaultValuePipe, Get, Param, ParseBoolPipe, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, OrganizationId } from '../../auth/auth.decorators';
import { ChargesService } from './charges.service';

@ApiTags('charges')
@Controller('charges')
export class ChargesController {
    constructor(private readonly chargesService: ChargesService) {}

    @ApiOperation({
        summary: "Every charge the patient incurred, newest first, whoever pays",
        description: "Each has its date and time (`createdAt`), `category` (the item's kind), `description` (the service or " +
        "item, as charged), `billableItem`, `quantity`, `unitPrice`, `amount`, and `shares`: who owes what. A share is " +
        "{ owedBy: ACCOUNT | PAYER | HOSPITAL, basis, amount, paid, outstanding, paymentStatus } plus `account` " +
        "{ id, accountNumber, name, holderName } for ACCOUNT, or `payer`, `plan`, `memberNumber`, `reviewStatus` for PAYER. " +
        "A charge can have several payers; a free item has no shares.",
    })
    @ApiQuery({ name: 'encounterId', required: false, description: "Only this visit's charges" })
    @Authorize('billing.view')
    @Get('patients/:patientId')
    findAllIncurredByPatientId(
        @Param('patientId', ParseUUIDPipe) patientId: string,
        @OrganizationId() orgId: string,
        @Query('encounterId', new ParseUUIDPipe({ optional: true })) encounterId?: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.chargesService.findAllIncurredByPatientId(orgId, patientId, { encounterId, limit, offset });
    }


    @ApiOperation({
        summary: "What the patient has to pay: their account's shares of their charges, newest first",
        description: "Each doc is one share: { id, basis (NOT_COVERED, COPAY, OVER_LIMIT, REBILLED), amount, paid, outstanding, " +
        "paymentStatus, billingAccount { id, accountNumber, name, holderName }, charge { createdAt, category, description, " +
        "billableItem, quantity, unitPrice, amount, encounter… } }. Payer shares and write-offs are left out. " +
        "`outstanding` at the top is the patient's total still owed. Pay with POST /billing-accounts/:id/deposits.",
    })
    @ApiQuery({ name: 'encounterId', required: false, description: "Only this visit's charges" })
    @ApiQuery({ name: 'unpaid', required: false, type: Boolean, description: 'Only shares still owed' })
    @Authorize('billing.view')
    @Get('patients/:patientId/payable')
    findPayableByPatientId(
        @Param('patientId', ParseUUIDPipe) patientId: string,
        @OrganizationId() orgId: string,
        @Query('encounterId', new ParseUUIDPipe({ optional: true })) encounterId?: string,
        @Query('unpaid', new ParseBoolPipe({ optional: true })) unpaid?: boolean,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    ) {
        return this.chargesService.findPayableByPatientId(orgId, patientId, { encounterId, unpaid, limit, offset });
    }
}
