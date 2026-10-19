import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AGE_SETTINGS_SELECT, AgeSettings, ageSettingsProblem } from '../patients/age-group';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { DepartmentsService } from '../departments/departments.service';
import { AccessControlService } from '../access-control/access-control.service';
import { BranchDto, CreateBranchDto, OnboardOrganizationDto, OrganizationDto, UpdateBranchDto, UpdateOrganizationDto } from '@shared/contracts/organizations';
import { BranchStatus, BusinessType, OrgType, OrganizationFilter, PaymentPlan } from '@shared/enums/organizations/organization.enums';
import { Prisma, $Enums } from '../../generated/prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OrganizationsService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly departmentsService: DepartmentsService,
        private readonly accessControlService: AccessControlService,
    ) { }

    async create(dto: OnboardOrganizationDto) {
        const { org, admin, mainBranchName } = dto;
        // Unset early-life bands take the column defaults; validate what will actually be stored
        assertAgeSettings({ ...STANDARD_EARLY_BANDS, ...definedOnly(org) });

        const hashedPassword = await bcrypt.hash(admin.password, 10);

        const result = await this.databaseService.client.$transaction(async (prisma) => {
            const existingOrg = await prisma.organization.findFirst({
                where: { name: { equals: org.name, mode: 'insensitive' } },
            });
            if (existingOrg) {
                throw new ConflictException('An organization with this name already exists');
            }

            const existingAdmin = await prisma.user.findUnique({ where: { email: admin.email } });
            if (existingAdmin) {
                throw new ConflictException('A user with this email already exists');
            }

            const organization = await prisma.organization.create({
                data: {
                    name: org.name,
                    address: org.address,
                    logo: org.logo,
                    phone: org.phone,
                    email: org.email,
                    city: org.city,
                    state: org.state,
                    country: org.country,
                    zipCode: org.zipCode,
                    website: org.website,
                    slogan: org.slogan,
                    pobox: org.pobox,
                    nfcCardFee: org.nfcCardFee,
                    registrationFee: org.registrationFee,
                    consultationFee: org.consultationFee,
                    consultationPayment: org.consultationPayment as $Enums.ConsultationPayment | undefined,
                    maxUnpaidBeforeHold: org.maxUnpaidBeforeHold,
                    patientNumberStart: org.patientNumberStart,
                    neonateMaxDays: org.neonateMaxDays,
                    infantBelowYears: org.infantBelowYears,
                    underFiveBelowYears: org.underFiveBelowYears,
                    childMaxYears: org.childMaxYears,
                    paediatricMaxAge: org.paediatricMaxAge,
                    geriatricMinAge: org.geriatricMinAge,
                    paymentPlan: org.paymentPlan as $Enums.PaymentPlan,
                    businessType: (org.businessType ?? 'HOSPITAL') as $Enums.BusinessType,
                    orgType: (org.orgType ?? 'STANDALONE') as $Enums.OrgType,
                    healthcareNetworkId: org.healthcareNetworkId,
                    healthcareNetworkName: org.healthcareNetworkName,
                },
            });

            const branch = await prisma.branch.create({
                data: {
                    organizationId: organization.id,
                    name: mainBranchName ?? 'Headquarters',
                    code: 'MAIN',
                    address: organization.address,
                    city: organization.city,
                    state: organization.state,
                    country: organization.country,
                    phone: organization.phone,
                    email: organization.email,
                    isMainBranch: true,
                },
            });

            const user = await prisma.user.create({
                data: {
                    email: admin.email,
                    password: hashedPassword,
                    firstName: admin.firstName,
                    lastName: admin.lastName,
                    phone: admin.phone,
                    type: $Enums.UserType.HOSPITAL_STAFF,
                    status: $Enums.UserStatus.ACTIVE,
                },
            });

            await prisma.hospitalStaff.create({
                data: {
                    user: { connect: { id: user.id } },
                    hospital: { connect: { id: organization.id } },
                    branch: { connect: { id: branch.id } },
                    role: $Enums.HospitalStaffRole.SUPERADMIN,
                },
            });

            await this.departmentsService.seedForOrg(prisma, organization.businessType);
            await this.accessControlService.seedForOrg(prisma, user.id);

            return { organization, branch, user };
        }, { timeout: 30000 });

        const { password: _, ...adminWithoutPassword } = result.user;

        return {
            organization: this.mapToOrganizationDto(result.organization),
            mainBranch: this.mapToBranchDto(result.branch),
            admin: adminWithoutPassword,
        };
    }


    async findAll(limit: number, offset: number, search?: string, filter?: OrganizationFilter): Promise<{ count: number; docs: OrganizationDto[] }> {
        try {
            const whereClause: any = {};

            if (search) {
                whereClause.OR = [
                    { name: { contains: search, mode: "insensitive" } },
                    { address: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { city: { contains: search, mode: "insensitive" } },
                    { website: { contains: search, mode: "insensitive" } },
                    { slogan: { contains: search, mode: "insensitive" } },
                ];
            }
            if (filter?.city) {
                whereClause.city = filter.city;
            }

            if (filter?.state) {
                whereClause.state = filter.state;
            }

            if (filter?.country) {
                whereClause.country = filter.country;
            }

            if (filter?.paymentPlan) {
                whereClause.paymentPlan = filter.paymentPlan;
            }

            const [organizations, count] = await this.databaseService.client.$transaction([
                this.databaseService.client.organization.findMany({
                    take: limit,
                    skip: offset,
                    where: whereClause,
                    orderBy: { createdAt: 'asc' },
                }),
                this.databaseService.client.organization.count({
                    where: whereClause,
                }),
            ]);

            return {
                count,
                docs: organizations.map(organization => this.mapToOrganizationDto(organization)),
            };

        } catch (error) {
            throw new ConflictException(error);
        }

    }

    async findOne(id: string): Promise<OrganizationDto> {

        const organization = await this.databaseService.client.organization.findUnique({
            where: {
                id: id
            },
            include: {
                staffs: true
            }
        });
        if (!organization) {
            throw new NotFoundException('sever error could not find this organization', {
                cause: new Error(),
                description: 'no organization found'
            });
        }

        const organizationAccount: OrganizationDto = {
             ...organization,
            logo: organization.logo ?? undefined,
            website: organization.website ?? undefined,
            slogan: organization.slogan ?? undefined,
            pobox: organization.pobox ?? undefined,
            paymentPlan: organization.paymentPlan as unknown as PaymentPlan,
            businessType: organization.businessType as unknown as BusinessType,
            orgType: organization.orgType as unknown as OrgType,
            healthcareNetworkId: organization.healthcareNetworkId ?? undefined,
            healthcareNetworkName: organization.healthcareNetworkName ?? undefined,
            nfcCardFee:  organization.nfcCardFee as unknown as number,
            registrationFee: organization.registrationFee as unknown as number,
            consultationFee: organization.consultationFee as unknown as number,
            maxUnpaidBeforeHold: organization.maxUnpaidBeforeHold as unknown as number,
        };
        return organizationAccount;

    }

    async update(id: string, updateOrganizationDto: UpdateOrganizationDto): Promise<OrganizationDto> {
        const current = await this.databaseService.client.organization.findUnique({
            where: { id }, select: { ...AGE_SETTINGS_SELECT, patientNumberStart: true },
        });
        if (!current) throw new NotFoundException('Organization not found');
        const { patientNumberStart, ...ageSettings } = current;
        assertAgeSettings({ ...ageSettings, ...definedOnly(updateOrganizationDto) });
        // Lowering it would read as "numbers restart here", which they can't once higher ones exist
        if (updateOrganizationDto.patientNumberStart !== undefined && updateOrganizationDto.patientNumberStart < patientNumberStart) {
            throw new BadRequestException(`patientNumberStart can only be raised (currently ${patientNumberStart})`);
        }

        try {
            const updateOrganizationInput: Prisma.OrganizationUpdateInput = {
                ...updateOrganizationDto,
                paymentPlan: updateOrganizationDto.paymentPlan as $Enums.PaymentPlan ?? undefined,
                businessType: updateOrganizationDto.businessType as $Enums.BusinessType ?? undefined,
                orgType: updateOrganizationDto.orgType as $Enums.OrgType ?? undefined,
                consultationPayment: updateOrganizationDto.consultationPayment as $Enums.ConsultationPayment ?? undefined,
            };

            const organization = await this.databaseService.client.organization.update({
                where: { id },
                data: { ...updateOrganizationInput }
            });

           const organizationAccount: OrganizationDto = {
             ...organization,
            logo: organization.logo ?? undefined,
            website: organization.website ?? undefined,
            slogan: organization.slogan ?? undefined,
            pobox: organization.pobox ?? undefined,
            paymentPlan: organization.paymentPlan as unknown as PaymentPlan,
            businessType: organization.businessType as unknown as BusinessType,
            orgType: organization.orgType as unknown as OrgType,
            healthcareNetworkId: organization.healthcareNetworkId ?? undefined,
            healthcareNetworkName: organization.healthcareNetworkName ?? undefined,
            nfcCardFee:  organization.nfcCardFee as unknown as number,
            registrationFee: organization.registrationFee as unknown as number,
            consultationFee: organization.consultationFee as unknown as number,
            maxUnpaidBeforeHold: organization.maxUnpaidBeforeHold as unknown as number,
        };
            return organizationAccount;

        } catch (error) {
            throw new ConflictException(error);
        }
    }

    async remove(id: string, updaterId: string): Promise<OrganizationDto> {

        const organization = await this.databaseService.client.$transaction(async (prisma) => {
            const organization = await prisma.organization.update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                    deletedBy: updaterId
                }
            });

            return organization
        });

        const organizationAccount: OrganizationDto = {
             ...organization,
            logo: organization.logo ?? undefined,
            website: organization.website ?? undefined,
            slogan: organization.slogan ?? undefined,
            pobox: organization.pobox ?? undefined,
            paymentPlan: organization.paymentPlan as unknown as PaymentPlan,
            businessType: organization.businessType as unknown as BusinessType,
            orgType: organization.orgType as unknown as OrgType,
            healthcareNetworkId: organization.healthcareNetworkId ?? undefined,
            healthcareNetworkName: organization.healthcareNetworkName ?? undefined,
            nfcCardFee:  organization.nfcCardFee as unknown as number,
            registrationFee: organization.registrationFee as unknown as number,
            consultationFee: organization.consultationFee as unknown as number,
            maxUnpaidBeforeHold: organization.maxUnpaidBeforeHold as unknown as number,
        };
        return organizationAccount;

    }

    async permanentDelete(id: string): Promise<OrganizationDto> {

        const organization = await this.databaseService.client.$transaction(async (prisma) => {
            const organization = await prisma.organization.delete({
                where: { id },
            });

            return organization
        });
        const organizationAccount: OrganizationDto = {
             ...organization,
            logo: organization.logo ?? undefined,
            website: organization.website ?? undefined,
            slogan: organization.slogan ?? undefined,
            pobox: organization.pobox ?? undefined,
            paymentPlan: organization.paymentPlan as unknown as PaymentPlan,
            businessType: organization.businessType as unknown as BusinessType,
            orgType: organization.orgType as unknown as OrgType,
            healthcareNetworkId: organization.healthcareNetworkId ?? undefined,
            healthcareNetworkName: organization.healthcareNetworkName ?? undefined,
            nfcCardFee:  organization.nfcCardFee as unknown as number,
            registrationFee: organization.registrationFee as unknown as number,
            consultationFee: organization.consultationFee as unknown as number,
            maxUnpaidBeforeHold: organization.maxUnpaidBeforeHold as unknown as number,
        };
        return organizationAccount;

    }

    async createBranch(organizationId: string, dto: CreateBranchDto): Promise<BranchDto> {
        await this.assertOrganizationExists(organizationId);

        const existing = await this.databaseService.client.branch.findUnique({ where: { code: dto.code } });
        if (existing) {
            throw new ConflictException(`A branch with code "${dto.code}" already exists`);
        }

        const branch = await this.databaseService.client.branch.create({
            data: { ...dto, organizationId },
        });

        return this.mapToBranchDto(branch);
    }

    async findBranches(organizationId: string): Promise<BranchDto[]> {
        await this.assertOrganizationExists(organizationId);

        const branches = await this.databaseService.client.branch.findMany({
            where: { organizationId, deletedAt: null },
            orderBy: [{ isMainBranch: 'desc' }, { createdAt: 'asc' }],
        });

        return branches.map(b => this.mapToBranchDto(b));
    }

    async updateBranch(organizationId: string, branchId: string, dto: UpdateBranchDto): Promise<BranchDto> {
        const branch = await this.databaseService.client.branch.findFirst({
            where: { id: branchId, organizationId, deletedAt: null },
        });
        if (!branch) throw new NotFoundException('Branch not found');

        const updated = await this.databaseService.client.branch.update({
            where: { id: branchId },
            data: {
                ...dto,
                status: dto.status as $Enums.BranchStatus ?? undefined,
            },
        });

        return this.mapToBranchDto(updated);
    }

    async removeBranch(organizationId: string, branchId: string, deletedBy: string): Promise<BranchDto> {
        const branch = await this.databaseService.client.branch.findFirst({
            where: { id: branchId, organizationId, deletedAt: null },
        });
        if (!branch) throw new NotFoundException('Branch not found');
        if (branch.isMainBranch) {
            throw new BadRequestException('The main branch cannot be deleted');
        }

        const deleted = await this.databaseService.client.branch.update({
            where: { id: branchId },
            data: { deletedAt: new Date(), deletedBy },
        });

        return this.mapToBranchDto(deleted);
    }

    private async assertOrganizationExists(id: string): Promise<void> {
        const org = await this.databaseService.client.organization.findUnique({ where: { id } });
        if (!org) throw new NotFoundException('Organization not found');
    }

    private mapToBranchDto(branch: any): BranchDto {
        return {
            id: branch.id,
            organizationId: branch.organizationId,
            name: branch.name,
            code: branch.code,
            address: branch.address,
            city: branch.city,
            state: branch.state,
            country: branch.country,
            phone: branch.phone,
            email: branch.email ?? undefined,
            isMainBranch: branch.isMainBranch,
            status: branch.status as BranchStatus,
            createdAt: branch.createdAt,
            updatedAt: branch.updatedAt,
            updatedBy: branch.updatedBy ?? undefined,
            deletedAt: branch.deletedAt ?? undefined,
            deletedBy: branch.deletedBy ?? undefined,
        };
    }

    private mapToOrganizationDto(organization: any): OrganizationDto {
        return {
             ...organization,
            logo: organization.logo ?? undefined,
            website: organization.website ?? undefined,
            slogan: organization.slogan ?? undefined,
            pobox: organization.pobox ?? undefined,
            paymentPlan: organization.paymentPlan as unknown as PaymentPlan,
            businessType: organization.businessType as unknown as BusinessType,
            orgType: organization.orgType as unknown as OrgType,
            healthcareNetworkId: organization.healthcareNetworkId ?? undefined,
            healthcareNetworkName: organization.healthcareNetworkName ?? undefined,
            nfcCardFee:  organization.nfcCardFee as unknown as number,
            registrationFee: organization.registrationFee as unknown as number,
            consultationFee: organization.consultationFee as unknown as number,
            maxUnpaidBeforeHold: organization.maxUnpaidBeforeHold as unknown as number,
        };
    }
}

// Matches the column defaults on Organization
const STANDARD_EARLY_BANDS = { neonateMaxDays: 28, infantBelowYears: 1, underFiveBelowYears: 5, childMaxYears: 12 };

/** The age-setting fields present in a DTO (undefined ones keep the stored or default value). */
function definedOnly(dto: Partial<AgeSettings>): Partial<AgeSettings> {
    const keys = Object.keys(AGE_SETTINGS_SELECT) as (keyof AgeSettings)[];
    return Object.fromEntries(keys.filter(k => dto[k] !== undefined).map(k => [k, dto[k]]));
}

/** The age bands must run in order (06 §2.7). */
function assertAgeSettings(settings: Partial<AgeSettings>) {
    const problem = ageSettingsProblem({ paediatricMaxAge: null, geriatricMinAge: null, ...STANDARD_EARLY_BANDS, ...settings });
    if (problem) throw new BadRequestException(problem);
}
