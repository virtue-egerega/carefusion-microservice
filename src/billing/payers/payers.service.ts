import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums } from '../../../generated/prisma/client';
import { CreatePayerDto, CreatePlanDto, PlanBenefitDto, UpdatePayerDto, UpdatePlanDto } from '@shared/contracts/billing';
import { BillingAccountsService } from '../accounts/billing-accounts.service';

const benefitRows = (benefits: PlanBenefitDto[]) => benefits.map(b => ({
    category:        b.category as $Enums.ServiceCategory,
    covered:         b.covered ?? true,
    copayPercent:    b.copayPercent,
    annualLimit:     b.annualLimit,
    requiresPreAuth: b.requiresPreAuth ?? false,
}));

/** Payers and their plans (PRD 10 §4.1–4.2). Scoped to the caller's organisation. */
@Injectable()
export class PayersService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly billingAccounts: BillingAccountsService,
    ) {}

    // ── Payers ───────────────────────────────────────────────────────────────

    /** Creates the payer together with its PAYER ledger account (§3.1), in one insert. */
    async create(dto: CreatePayerDto, organizationId: string, createdBy: string) {
        const { creditLimit, ...payer } = dto;
        return withConstraintErrors(
            async () => this.databaseService.client.payer.create({
                data: {
                    ...payer,
                    payerType:      dto.payerType as $Enums.PayerType,
                    settlementMode: dto.settlementMode as $Enums.SettlementMode,
                    phone:          dto.phone ?? [],
                    organizationId,
                    updatedBy:      createdBy,
                    account: {
                        create: {
                            organizationId,
                            accountNumber: await this.billingAccounts.nextAccountNumber(),
                            accountType:   $Enums.BillingAccountType.PAYER,
                            name:          dto.name,
                            holderPhone:   dto.phone ?? [],
                            creditLimit:   creditLimit ?? 0,
                            updatedBy:     createdBy,
                        },
                    },
                },
                include: { account: { select: { id: true, accountNumber: true, balance: true, creditLimit: true } } },
            }),
            { conflict: 'A payer with this name already exists' },
        );
    }

    async findAll(organizationId: string, payerType?: $Enums.PayerType) {
        return this.databaseService.client.payer.findMany({
            where:   { organizationId, ...(payerType && { payerType }) },
            orderBy: { name: 'asc' },
            include: {
                account: { select: { id: true, accountNumber: true, balance: true, creditLimit: true } },
                _count:  { select: { plans: true } },
            },
        });
    }

    async findOne(payerId: string, organizationId: string) {
        const payer = await this.databaseService.client.payer.findFirst({
            where:   { id: payerId, organizationId },
            include: {
                account: { select: { id: true, accountNumber: true, balance: true, unappliedCredit: true, creditLimit: true } },
                plans:   { include: { benefits: true }, orderBy: { name: 'asc' } },
            },
        });
        if (!payer) throw new NotFoundException('Payer not found');
        return payer;
    }

    async update(payerId: string, dto: UpdatePayerDto, organizationId: string, updatedBy: string) {
        const { count } = await withConstraintErrors(
            () => this.databaseService.client.payer.updateMany({
                where: { id: payerId, organizationId },
                data: {
                    ...dto,
                    payerType:      dto.payerType as $Enums.PayerType | undefined,
                    settlementMode: dto.settlementMode as $Enums.SettlementMode | undefined,
                    status:         dto.status as $Enums.AccountStatus | undefined,
                    updatedBy,
                },
            }),
            { conflict: 'A payer with this name already exists' },
        );
        if (!count) throw new NotFoundException('Payer not found');
        return { message: 'Payer updated' };
    }

    // ── Plans ────────────────────────────────────────────────────────────────

    async createPlan(payerId: string, dto: CreatePlanDto, organizationId: string, createdBy: string) {
        await this.assertPayer(payerId, organizationId);
        const { benefits, ...plan } = dto;

        return withConstraintErrors(
            () => this.databaseService.client.plan.create({
                data: {
                    ...plan,
                    overLimitAction: dto.overLimitAction as $Enums.OverLimitAction | undefined,
                    payerId,
                    updatedBy: createdBy,
                    benefits:  { create: benefitRows(benefits ?? []) },
                },
                include: { benefits: true },
            }),
            { conflict: 'This payer already has a plan with that name, or a category is listed twice' },
        );
    }

    /** Updates plan terms; when `benefits` is given it replaces the whole category list. */
    async updatePlan(planId: string, dto: UpdatePlanDto, organizationId: string, updatedBy: string) {
        await this.assertPlan(planId, organizationId);
        const { benefits, ...plan } = dto;

        return this.databaseService.transaction(async () => withConstraintErrors(
            () => this.databaseService.client.plan.update({
                where: { id: planId },
                data: {
                    ...plan,
                    overLimitAction: dto.overLimitAction as $Enums.OverLimitAction | undefined,
                    status:          dto.status as $Enums.AccountStatus | undefined,
                    updatedBy,
                    ...(benefits && { benefits: { deleteMany: {}, create: benefitRows(benefits) } }),
                },
                include: { benefits: true },
            }),
            { conflict: 'This payer already has a plan with that name, or a category is listed twice' },
        ));
    }

    async findPlans(payerId: string, organizationId: string) {
        return this.databaseService.client.plan.findMany({
            where:   { payerId, payer: { organizationId } },
            orderBy: { name: 'asc' },
            include: { benefits: true, _count: { select: { policies: true } } },
        });
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async assertPayer(payerId: string, organizationId: string) {
        const found = await this.databaseService.client.payer.count({ where: { id: payerId, organizationId } });
        if (!found) throw new NotFoundException('Payer not found');
    }

    private async assertPlan(planId: string, organizationId: string) {
        const found = await this.databaseService.client.plan.count({ where: { id: planId, payer: { organizationId } } });
        if (!found) throw new NotFoundException('Plan not found');
    }
}
