import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { AddCoverageDto, EnrolPolicyDto, SetCoveragePriorityDto } from '@shared/contracts/billing';
import { CoverageService } from './coverage.service';

@ApiTags('coverage')
@Controller()
export class CoverageController {
    constructor(private readonly coverageService: CoverageService) {}

    @ApiOperation({ summary: 'Enrol a principal: creates the policy and their coverage' })
    @Authorize('coverage.enrol')
    @Post('plans/:id/policies')
    enrol(@Param('id') planId: string, @Body() dto: EnrolPolicyDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.coverageService.enrolPrincipal(planId, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Policy with all its coverages' })
    @Authorize('coverage.view')
    @Get('policies/:id')
    findPolicy(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.coverageService.findPolicy(id, orgId);
    }

    @ApiOperation({ summary: "Add a dependant, checked against the plan's dependant rules" })
    @Authorize('coverage.enrol')
    @Post('policies/:id/coverages')
    addDependant(@Param('id') policyId: string, @Body() dto: AddCoverageDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.coverageService.addDependant(policyId, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'End a coverage now (ending the principal ends the policy)' })
    @Authorize('coverage.end')
    @Delete('coverages/:id')
    endCoverage(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.coverageService.endCoverage(id, orgId);
    }

    @ApiOperation({ summary: "A patient's coverages with remaining benefit this year" })
    @Authorize('coverage.view')
    @Get('patients/:id/coverages')
    forPatient(@Param('id') patientId: string, @OrganizationId() orgId: string) {
        return this.coverageService.forPatient(patientId, orgId);
    }

    @ApiOperation({ summary: "Order a patient's coverages; the first becomes the default at visits" })
    @Authorize('coverage.select')
    @Put('patients/:id/coverages/priority')
    setPriority(@Param('id') patientId: string, @Body() dto: SetCoveragePriorityDto, @OrganizationId() orgId: string) {
        return this.coverageService.setPriority(patientId, dto.coverageIds, orgId);
    }
}
