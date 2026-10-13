import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { CreatePayerDto, CreatePlanDto, UpdatePayerDto, UpdatePlanDto } from '@shared/contracts/billing';
import { PayerType } from '@shared/enums/billing/billing.enums';
import { $Enums } from '../../../generated/prisma/client';
import { PayersService } from './payers.service';

@ApiTags('payers')
@Controller()
export class PayersController {
    constructor(private readonly payersService: PayersService) {}

    // ── Payers ───────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create a payer (HMO, NHIS, company, staff cover) with its ledger account' })
    @Authorize('payer.manage')
    @Post('payers')
    create(@Body() dto: CreatePayerDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.payersService.create(dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'List payers' })
    @ApiQuery({ name: 'payerType', enum: PayerType, required: false })
    @Authorize('coverage.view')
    @Get('payers')
    findAll(@OrganizationId() orgId: string, @Query('payerType') payerType?: PayerType) {
        return this.payersService.findAll(orgId, payerType as $Enums.PayerType | undefined);
    }

    @ApiOperation({ summary: 'Payer with its account and plans' })
    @Authorize('coverage.view')
    @Get('payers/:id')
    findOne(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.payersService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Update payer details or suspend it (credit limit changes need an approved request)' })
    @Authorize('payer.manage')
    @Patch('payers/:id')
    update(@Param('id') id: string, @Body() dto: UpdatePayerDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
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
}
