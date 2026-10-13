import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import {
    AddCoverageDto, CreatePayerDto, CreatePlanDto, EnrolPolicyDto, SetCoveragePriorityDto, UpdatePayerDto, UpdatePlanDto,
} from '@shared/contracts/billing';
import { PayerType } from '@shared/enums/billing/billing.enums';
import { $Enums } from '../../../generated/prisma/client';
import { CoverageService } from './coverage.service';
import { PayersService } from './payers.service';

@ApiTags('payers & coverage')
@Controller()
export class CoverageController {
    constructor(
        private readonly payersService: PayersService,
        private readonly coverageService: CoverageService,
    ) {}

    // ── Payers ───────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create a payer (HMO, NHIS, company, staff cover) with its ledger account' })
    @Authorize('payer.manage')
    @Post('payers')
    createPayer(@Body() dto: CreatePayerDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.payersService.create(dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'List payers' })
    @ApiQuery({ name: 'payerType', enum: PayerType, required: false })
    @Authorize('coverage.view')
    @Get('payers')
    findPayers(@OrganizationId() orgId: string, @Query('payerType') payerType?: PayerType) {
        return this.payersService.findAll(orgId, payerType as $Enums.PayerType | undefined);
    }

    @ApiOperation({ summary: 'Payer with its account and plans' })
    @Authorize('coverage.view')
    @Get('payers/:id')
    findPayer(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.payersService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Update payer details or suspend it (credit limit changes need an approved request)' })
    @Authorize('payer.manage')
    @Patch('payers/:id')
    updatePayer(@Param('id') id: string, @Body() dto: UpdatePayerDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.payersService.update(id, dto, orgId, user.sub);
    }

    // ── Plans ────────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create a plan: copay, caps, dependant rules, category benefits' })
    @Authorize('payer.manage')
    @Post('payers/:id/plans')
    createPlan(@Param('id') payerId: string, @Body() dto: CreatePlanDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.payersService.createPlan(payerId, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: "List a payer's plans" })
    @Authorize('coverage.view')
    @Get('payers/:id/plans')
    findPlans(@Param('id') payerId: string, @OrganizationId() orgId: string) {
        return this.payersService.findPlans(payerId, orgId);
    }

    @ApiOperation({ summary: 'Update a plan; `benefits`, when given, replaces the category list' })
    @Authorize('payer.manage')
    @Patch('plans/:id')
    updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.payersService.updatePlan(id, dto, orgId, user.sub);
    }

    // ── Policies & coverage ──────────────────────────────────────────────────

    @ApiOperation({ summary: 'Enrol a principal: creates the policy and their coverage' })
    @Authorize('coverage.manage')
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
    @Authorize('coverage.manage')
    @Post('policies/:id/coverages')
    addDependant(@Param('id') policyId: string, @Body() dto: AddCoverageDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.coverageService.addDependant(policyId, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'End a coverage now (ending the principal ends the policy)' })
    @Authorize('coverage.manage')
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
    @Authorize('coverage.manage')
    @Put('patients/:id/coverages/priority')
    setPriority(@Param('id') patientId: string, @Body() dto: SetCoveragePriorityDto, @OrganizationId() orgId: string) {
        return this.coverageService.setPriority(patientId, dto.coverageIds, orgId);
    }
}
