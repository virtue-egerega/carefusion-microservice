import { Body, Controller, DefaultValuePipe, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatientsService, UpdateMedicalDto, AddAddressDto, AddNextOfKinDto, RegistrationPaymentDto } from './patients.service';
import { CreatePatientDto } from '@shared/contracts/patients';
import { Authorize, CurrentUser, OrganizationId } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';
import { BillingAccountsService } from '../billing/accounts/billing-accounts.service';

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
    constructor(
        private readonly patientsService: PatientsService,
        private readonly billingAccountsService: BillingAccountsService,
    ) {}

    @ApiOperation({ summary: 'Step 1 — Register patient (personal info; opens or joins a billing account)' })
    @Authorize('patient.register')
    @Post()
    create(@Body() dto: CreatePatientDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        // Registering straight onto a family account is also adding an account member
        if (dto.billingAccountId && !user.permissions.includes('billing.account.member.add')) {
            throw new ForbiddenException('Missing permission: billing.account.member.add');
        }
        return this.patientsService.create(dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Step 2 — Update medical profile (blood group, genotype, etc.)' })
    @Authorize('patient.edit')
    @Patch(':id/medical')
    updateMedical(@Param('id') id: string, @Body() dto: UpdateMedicalDto) {
        return this.patientsService.updateMedical(id, dto);
    }

    @ApiOperation({ summary: 'Step 3 — Add an address (RESIDENCE / WORK / ORIGIN)' })
    @Authorize('patient.edit')
    @Post(':id/addresses')
    addAddress(@Param('id') id: string, @Body() dto: AddAddressDto) {
        return this.patientsService.addAddress(id, dto);
    }

    @ApiOperation({ summary: 'Step 4 — Add a next of kin or emergency contact' })
    @Authorize('patient.edit')
    @Post(':id/next-of-kin')
    addNextOfKin(@Param('id') id: string, @Body() dto: AddNextOfKinDto) {
        return this.patientsService.addNextOfKin(id, dto);
    }

    @ApiOperation({ summary: 'Step 5 — Deposit and charge card + registration fees to the billing account' })
    @Authorize('billing.payment.receive')
    @Post(':id/payment')
    registerPayment(@Param('id') id: string, @Body() dto: RegistrationPaymentDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.patientsService.registerPayment(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'List patients — paginated with optional search' })
    @Authorize('patient.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0),  ParseIntPipe) offset: number,
        @Query('search') search?: string,
    ) {
        return this.patientsService.findAll(orgId, limit, offset, search);
    }

    @ApiOperation({ summary: "The patient's current billing account, balance and outstanding" })
    @Authorize('billing.view')
    @Get(':id/billing-account')
    billingAccount(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.billingAccountsService.getForPatient(id, orgId);
    }

    @ApiOperation({ summary: 'Get full patient record' })
    @Authorize('patient.view')
    @Get(':id')
    findOne(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.patientsService.findOne(id, orgId);
    }
}
