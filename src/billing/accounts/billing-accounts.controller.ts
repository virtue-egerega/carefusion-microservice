import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, BranchId, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { AddAccountMemberDto, CreateFamilyAccountDto, DepositDto, UpdateBillingAccountDto } from '@shared/contracts/billing';
import { BillingAccountType } from '@shared/enums/billing/billing.enums';
import { BillingAccountsService } from './billing-accounts.service';

@ApiTags('billing-accounts')
@Controller('billing-accounts')
export class BillingAccountsController {
    constructor(private readonly billingAccountsService: BillingAccountsService) {}

    @ApiOperation({ summary: 'Create a FAMILY account (the holder, if a patient, is moved onto it)' })
    @Authorize('billing.account.create')
    @Post()
    create(@Body() dto: CreateFamilyAccountDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.billingAccountsService.createFamily(dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'List / search billing accounts' })
    @ApiQuery({ name: 'accountType', enum: BillingAccountType, required: false })
    @Authorize('billing.view')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
        @Query('accountType') accountType?: BillingAccountType,
    ) {
        return this.billingAccountsService.findAll(orgId, limit, offset, search, accountType);
    }

    @ApiOperation({ summary: 'Account detail: members, balance, unapplied credit, outstanding' })
    @Authorize('billing.view')
    @Get(':id')
    findOne(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.billingAccountsService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Update name / holder details (credit limit changes need an approved request)' })
    @Authorize('billing.account.update')
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateBillingAccountDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.billingAccountsService.updateDetails(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Move a patient onto this family account' })
    @Authorize('billing.account.member.add')
    @Post(':id/members')
    addMember(@Param('id') id: string, @Body() dto: AddAccountMemberDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.billingAccountsService.moveMember(id, dto.patientId, user.sub, orgId);
    }

    @ApiOperation({ summary: 'Remove a patient from this family account (they return to their own account)' })
    @Authorize('billing.account.member.remove')
    @Delete(':id/members/:patientId')
    removeMember(@Param('id') id: string, @Param('patientId') patientId: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.billingAccountsService.removeMember(id, patientId, user.sub, orgId);
    }

    @ApiOperation({ summary: 'Record a deposit; pays targeted bills first, then the oldest unpaid' })
    @Authorize('billing.payment.receive')
    @Post(':id/deposits')
    deposit(
        @Param('id') id: string,
        @Body() dto: DepositDto,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.billingAccountsService.deposit(id, dto, { organizationId, branchId }, user.sub);
    }

    @ApiOperation({ summary: 'Ledger entries and open bills, optionally per member and date range' })
    @Authorize('billing.view')
    @Get(':id/statement')
    statement(
        @Param('id') id: string,
        @OrganizationId() orgId: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('patientId') patientId?: string,
    ) {
        return this.billingAccountsService.statement(id, orgId, {
            from: from ? new Date(from) : undefined,
            to:   to ? new Date(to) : undefined,
            patientId,
        });
    }
}
