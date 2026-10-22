import { Body, Controller, DefaultValuePipe, ForbiddenException, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatientsService, UpdateMedicalDto, AddAddressDto, AddNextOfKinDto } from './patients.service';
import { CreatePatientDto } from '@shared/contracts/patients';
import { EncounterListQueryDto } from '@shared/contracts/encounters';
import { Authorize, BranchId, CurrentUser, OrganizationId } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';
import { BillingAccountsService } from '../billing/accounts/billing-accounts.service';

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
    constructor(
        private readonly patientsService: PatientsService,
        private readonly billingAccountsService: BillingAccountsService,
    ) {}

    @ApiOperation({ summary: 'Step 1 — Register patient at your branch; opens or joins a billing account and bills the registration fees' })
    @Authorize('patient.register')
    @Post()
    create(
        @Body() dto: CreatePatientDto,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        // Registering straight onto a family account is also adding an account member
        if (dto.billingAccountId && !user.permissions.includes('billing.account.member.add')) {
            throw new ForbiddenException('Missing permission: billing.account.member.add');
        }
        return this.patientsService.create(dto, { organizationId, branchId }, user.sub);
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

    @ApiOperation({ summary: 'List patients — paginated with optional search' })
    @Authorize('patient.list')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0),  ParseIntPipe) offset: number,
        @Query('search') search?: string,
    ) {
        return this.patientsService.findAll(orgId, limit, offset, search);
    }

    // Declared before :id so "stats" isn't read as a patient id
    @ApiOperation({ summary: 'Patient statistics for the list header — total, new this month, growth' })
    @Authorize('patient.list')
    @Get('stats')
    stats(@OrganizationId() orgId: string) {
        return this.patientsService.stats(orgId);
    }

    @ApiOperation({ summary: "The patient's current billing account, balance and outstanding" })
    @Authorize('billing.view')
    @Get(':id/billing-account')
    billingAccount(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.billingAccountsService.getForPatient(id, orgId);
    }

    @ApiOperation({
        summary: "The patient's encounters, newest first: filter by status, type, how they came, clinic and dates; search by code or reason",
        description: '`{ count, docs }`. Each: `id`, `code`, `arrivedAt`, `encounterType`, `visitType`, `status`, `reasonForVisit`, ' +
        "`closedAt`, `clinic`, and `doctor`: the clinician who saw the patient (null while waiting). Remaining tasks are on the encounter's own detail.",
    })
    @Authorize('patient.view')
    @Get(':id/encounters')
    findEncounters(
        @Param('id', ParseUUIDPipe) id: string,
        @Query() query: EncounterListQueryDto,
        @OrganizationId() orgId: string,
    ) {
        return this.patientsService.findEncounters(id, orgId, query);
    }

    @ApiOperation({
        summary: 'Who the patient is, for page headers',
        description: '`id`, `patientNumber`, `firstName`, `middleName`, `lastName`, `sex`, `dateOfBirth`, `age` (completed ' +
        'years; null if the date of birth is unknown), `ageGroup`, and the current `billingAccount { id, accountNumber, accountType }`.',
    })
    @Authorize('patient.view')
    @Get(':id/summary')
    findSummary(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.patientsService.findSummary(id, orgId);
    }

    @ApiOperation({ summary: "Get one patient's full record" })
    @Authorize('patient.view')
    @Get(':id')
    findOne(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.patientsService.findOne(id, orgId);
    }
}
