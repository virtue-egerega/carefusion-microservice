import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authorize, BranchId, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { AccountTransactionsQueryDto, AddAccountMemberDto, CreateFamilyAccountDto, DepositDto, UpdateBillingAccountDto } from '@shared/contracts/billing';
import { BillingAccountType } from '@shared/enums/billing/billing.enums';
import { BillingAccountsService } from './billing-accounts.service';

@ApiTags('billing-accounts')
@Controller('billing-accounts')
export class BillingAccountsController {
    constructor(private readonly billingAccountsService: BillingAccountsService) {}

    @ApiOperation({ summary: 'Create a FAMILY account (a holder on their own INDIVIDUAL account has it converted instead)' })
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

    @ApiOperation({
        summary: 'Account detail: members, balance, unapplied credit, outstanding, unpaid charges',
        description: "`outstanding`: total still owed on the account's unpaid and part-paid shares. `unpaidCharges`: how many charges " +
        'those are (all members). `unappliedCredit`: money paid in and not yet used, available for the next bills.',
    })
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

    @ApiOperation({ summary: 'Move a patient onto this account (an INDIVIDUAL account becomes FAMILY)' })
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

    @ApiOperation({
        summary: "Record a deposit; it pays the account's unpaid bills oldest first",
        description: 'Each bill is paid in full while the money lasts; the one where it runs out is part-paid, and application stops there (PRD 10 §7.1). Anything left stays as unapplied credit. Patients held for payment are released in the same transaction. Returns `{ id, amount, createdAt, message }`.',
    })
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

    @ApiOperation({
        summary: "The account's transactions, newest first: filter by type, direction, patient, payment mode, branch and dates; search by description, reference or patient",
        description: 'Each row: `direction` (CREDIT money in / DEBIT money out), `patient` it was for, the bill a charge was (`allocation.charge`), whether it was reversed (`reversedBy`). Money in also has `paid` (each bill it paid, and how much) and `unapplied` (still on the account). Paginated with `limit` (max 100) and `offset`.',
    })
    @Authorize('billing.view')
    @Get(':id/transactions')
    transactions(
        @Param('id', ParseUUIDPipe) id: string,
        @Query() query: AccountTransactionsQueryDto,
        @OrganizationId() orgId: string,
    ) {
        return this.billingAccountsService.transactions(id, orgId, query);
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
