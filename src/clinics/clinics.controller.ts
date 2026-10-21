import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, BranchId, OrganizationId } from '../auth/auth.decorators';
import { ClinicsService } from './clinics.service';

@ApiTags('clinics')
@Controller('clinics')
export class ClinicsController {
    constructor(private readonly clinicsService: ClinicsService) {}

    @ApiOperation({ summary: 'Clinics reception can check a patient into ("what kind of doctor are you seeing today?")' })
    @Authorize()
    @Get()
    findAll() {
        return this.clinicsService.findAll();
    }

    @ApiOperation({
        summary: `The consultation fee for this clinic, before starting the patient's encounter`,
        description:
            'With patientId: whether starting the encounter would charge them (charged), why not if it would not ' +
            '(exemption: INSURED or CONTINUING_SAME_CLINIC), and their billing account (balance, unappliedCredit, creditLimit).',
    })
    @ApiQuery({ name: 'patientId', required: false })
    @Authorize('encounter.create')
    @Get(':id/consultation-fee')
    consultationFee(
        @Param('id', ParseUUIDPipe) id: string,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @Query('patientId', new ParseUUIDPipe({ optional: true })) patientId?: string,
    ) {
        return this.clinicsService.consultationFee(id, { organizationId, branchId }, patientId);
    }
}
