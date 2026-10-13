import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { withConstraintErrors } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { AddCoverageDto, EnrolPolicyDto } from '@shared/contracts/billing';
import { benefitPeriod, childAgeOutDate, dependantRefusal, isCoverageActive, MemberTypeValue } from './coverage.rules';

const COVERAGE_CHAIN = {
    policy: {
        include: {
            plan: { include: { benefits: true, payer: { select: { id: true, name: true, status: true, settlementMode: true } } } },
        },
    },
} satisfies Prisma.CoverageInclude;

const earliest = (...dates: (Date | null | undefined)[]) =>
    dates.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

/** Policies and coverage (PRD 10 §4.3–4.4). Scoped to the caller's organisation. */
@Injectable()
export class CoverageService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** Creates the policy and its PRINCIPAL coverage in one insert. */
    async enrolPrincipal(planId: string, dto: EnrolPolicyDto, organizationId: string, createdBy: string) {
        const plan = await this.databaseService.client.plan.findFirst({
            where:  { id: planId, payer: { organizationId } },
            select: { status: true, payer: { select: { status: true } } },
        });
        if (!plan) throw new NotFoundException('Plan not found');
        if (plan.status !== $Enums.AccountStatus.ACTIVE || plan.payer.status !== $Enums.AccountStatus.ACTIVE) {
            throw new ConflictException('Plan or payer is not active');
        }

        const validFrom = new Date(dto.validFrom);
        const validTo   = dto.validTo ? new Date(dto.validTo) : null;
        if (validTo && validTo <= validFrom) throw new BadRequestException('validTo must be after validFrom');

        return withConstraintErrors(
            () => this.databaseService.client.policy.create({
                data: {
                    planId,
                    policyNumber:       dto.policyNumber,
                    principalPatientId: dto.principalPatientId,
                    validFrom,
                    validTo,
                    updatedBy:          createdBy,
                    coverages: {
                        create: {
                            patientId:    dto.principalPatientId,
                            memberType:   $Enums.MemberType.PRINCIPAL,
                            memberNumber: dto.memberNumber,
                            priority:     dto.priority ?? 1,
                            validFrom,
                            validTo,
                            createdBy,
                        },
                    },
                },
                include: { coverages: true },
            }),
            { notFound: 'Principal patient not found', conflict: 'This plan already has a policy with that number' },
        );
    }

    /** Adds a dependant after checking the plan's dependant rules (§4.4). */
    async addDependant(policyId: string, dto: AddCoverageDto, organizationId: string, createdBy: string) {
        const client = this.databaseService.client;
        const [policy, patient] = await Promise.all([
            client.policy.findFirst({
                where:   { id: policyId, plan: { payer: { organizationId } } },
                include: {
                    plan:      true,
                    coverages: { where: { status: $Enums.PolicyStatus.ACTIVE }, select: { memberType: true } },
                },
            }),
            client.patient.findFirst({ where: { id: dto.patientId, hospitalId: organizationId }, select: { dateOfBirth: true } }),
        ]);
        if (!policy) throw new NotFoundException('Policy not found');
        if (!patient) throw new NotFoundException('Patient not found');
        if (policy.status !== $Enums.PolicyStatus.ACTIVE) throw new ConflictException('Policy is not active');

        const now = new Date();
        const active = policy.coverages.reduce<Partial<Record<MemberTypeValue, number>>>((acc, c) => {
            acc[c.memberType] = (acc[c.memberType] ?? 0) + 1;
            return acc;
        }, {});
        const refusal = dependantRefusal(policy.plan, dto.memberType as MemberTypeValue, active, patient.dateOfBirth, now);
        if (refusal) throw new BadRequestException(refusal);

        const validFrom = dto.validFrom ? new Date(dto.validFrom) : now;
        if (validFrom < policy.validFrom) throw new BadRequestException('Coverage cannot start before the policy');

        // A child's cover ends at their age-out birthday unless an earlier date is given
        const ageOut = dto.memberType === $Enums.MemberType.CHILD && policy.plan.childMaxAge !== null && patient.dateOfBirth
            ? childAgeOutDate(patient.dateOfBirth, policy.plan.childMaxAge)
            : null;
        const validTo = earliest(dto.validTo ? new Date(dto.validTo) : null, policy.validTo, ageOut);

        return withConstraintErrors(
            () => client.coverage.create({
                data: {
                    policyId,
                    patientId:    dto.patientId,
                    memberType:   dto.memberType as $Enums.MemberType,
                    memberNumber: dto.memberNumber,
                    priority:     dto.priority ?? 1,
                    validFrom,
                    validTo,
                    createdBy,
                },
            }),
            { conflict: 'This patient is already on the policy' },
        );
    }

    /** Ends a coverage now. Ending the principal ends the whole policy and every dependant. */
    async endCoverage(coverageId: string, organizationId: string) {
        const client   = this.databaseService.client;
        const coverage = await client.coverage.findFirst({
            where:  { id: coverageId, policy: { plan: { payer: { organizationId } } } },
            select: { id: true, policyId: true, memberType: true },
        });
        if (!coverage) throw new NotFoundException('Coverage not found');

        const ended = { status: $Enums.PolicyStatus.TERMINATED, validTo: new Date() };
        if (coverage.memberType !== $Enums.MemberType.PRINCIPAL) {
            await client.coverage.update({ where: { id: coverageId }, data: ended });
            return { message: 'Coverage ended' };
        }

        await this.databaseService.transaction(async () => {
            await this.databaseService.client.coverage.updateMany({
                where: { policyId: coverage.policyId, status: { not: $Enums.PolicyStatus.TERMINATED } },
                data:  ended,
            });
            await this.databaseService.client.policy.update({ where: { id: coverage.policyId }, data: ended });
        });
        return { message: 'Principal coverage ended; the policy and all dependants were terminated' };
    }

    async findPolicy(policyId: string, organizationId: string) {
        const policy = await this.databaseService.client.policy.findFirst({
            where:   { id: policyId, plan: { payer: { organizationId } } },
            include: {
                plan:      { select: { id: true, name: true, payer: { select: { id: true, name: true } } } },
                coverages: {
                    orderBy: { createdAt: 'asc' },
                    include: { patient: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } },
                },
            },
        });
        if (!policy) throw new NotFoundException('Policy not found');
        return policy;
    }

    /**
     * A patient's coverages, highest priority first, each with whether it applies today and what
     * is left of its caps in the current benefit year.
     */
    async forPatient(patientId: string, organizationId: string, at = new Date()) {
        const client    = this.databaseService.client;
        const coverages = await client.coverage.findMany({
            where:   { patientId, policy: { plan: { payer: { organizationId } } } },
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
            include: COVERAGE_CHAIN,
        });
        if (!coverages.length) return [];

        const usage = await client.benefitUsage.findMany({
            where: {
                OR: [
                    { scope: $Enums.UsageScope.MEMBER, scopeId: { in: coverages.map(c => c.id) } },
                    { scope: $Enums.UsageScope.POLICY, scopeId: { in: coverages.map(c => c.policyId) } },
                ],
            },
        });

        return coverages.map(coverage => {
            const { plan } = coverage.policy;
            const period   = benefitPeriod(coverage.policy.validFrom, at);
            const used = (scope: $Enums.UsageScope, scopeId: string, category: $Enums.ServiceCategory | null) =>
                usage.find(u => u.scope === scope && u.scopeId === scopeId && u.category === category
                    && u.periodStart.getTime() === period.start.getTime())?.usedAmount ?? new Prisma.Decimal(0);
            const remaining = (limit: Prisma.Decimal | null, spent: Prisma.Decimal) =>
                limit === null ? null : Prisma.Decimal.max(limit.minus(spent), 0);

            return {
                ...coverage,
                activeNow: isCoverageActive(coverage, at),
                benefitYear: period,
                remaining: {
                    member: remaining(plan.annualLimitPerMember, used($Enums.UsageScope.MEMBER, coverage.id, null)),
                    policy: remaining(plan.annualLimitPerPolicy, used($Enums.UsageScope.POLICY, coverage.policyId, null)),
                    categories: plan.benefits
                        .filter(b => b.covered && b.annualLimit !== null)
                        .map(b => ({
                            category:  b.category,
                            remaining: remaining(b.annualLimit, used($Enums.UsageScope.MEMBER, coverage.id, b.category)),
                        })),
                },
            };
        });
    }

    /** Re-orders a patient's coverages: the first id becomes priority 1 (the default at visits). */
    async setPriority(patientId: string, coverageIds: string[], organizationId: string) {
        const client = this.databaseService.client;
        const owned  = await client.coverage.count({
            where: { id: { in: coverageIds }, patientId, policy: { plan: { payer: { organizationId } } } },
        });
        if (owned !== coverageIds.length) throw new BadRequestException('Every id must be one of this patient\'s coverages');

        await this.databaseService.transaction(async () => {
            for (const [index, id] of coverageIds.entries()) {
                await this.databaseService.client.coverage.update({ where: { id }, data: { priority: index + 1 } });
            }
        });
        return { message: 'Coverage priority updated' };
    }
}
