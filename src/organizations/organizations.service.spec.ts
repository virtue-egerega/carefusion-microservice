import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OrganizationsService } from './organizations.service';
import { DatabaseService } from '../database/database.service';
import { OnboardOrganizationDto, UpdateOrganizationDto } from '@shared/contracts/organizations';
import { BusinessType, OrgType, PaymentPlan } from '@shared/enums/organizations/organization.enums';

const baseOrg = {
    name: "St. Mary's Hospital",
    address: '123 Main Street',
    logo: 'logo.png',
    phone: ['+1234567890'],
    email: 'contact@stmaryshospital.com',
    city: 'New York',
    state: 'NY',
    country: 'USA',
    zipCode: '10001',
    nfcCardFee: 1000,
    registrationFee: 0,
};

const baseAdmin = {
    email: 'admin@stmaryshospital.com',
    password: 'Password123!',
    firstName: 'John',
    lastName: 'Doe',
    phone: ['+1234567890'],
};

const baseOnboardDto: OnboardOrganizationDto = {
    org: baseOrg as any,
    admin: baseAdmin as any,
};

function mockOrgRecord(overrides: Record<string, any> = {}) {
    return {
        id: 'org-1',
        ...baseOrg,
        website: null, slogan: null, pobox: null,
        paymentPlan: null,
        businessType: 'HOSPITAL',
        orgType: 'STANDALONE',
        healthcareNetworkId: null,
        healthcareNetworkName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        ...overrides,
    };
}

function mockBranchRecord() {
    return {
        id: 'branch-1',
        organizationId: 'org-1',
        name: 'Headquarters',
        code: 'MAIN',
        address: baseOrg.address,
        city: baseOrg.city,
        state: baseOrg.state,
        country: baseOrg.country,
        phone: baseOrg.phone,
        email: baseOrg.email,
        isMainBranch: true,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null, deletedAt: null, deletedBy: null,
    };
}

function mockUserRecord() {
    return {
        id: 'user-1',
        email: baseAdmin.email,
        password: 'hashed',
        firstName: baseAdmin.firstName,
        lastName: baseAdmin.lastName,
        middleName: null,
        phone: baseAdmin.phone,
        type: 'HOSPITAL_STAFF',
        status: 'ACTIVE',
        loginAttempts: 0,
        refreshToken: null,
        lastLogin: null,
        roleId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null, deletedAt: null, deletedBy: null,
    };
}

describe('OrganizationsService', () => {
    let service: OrganizationsService;
    let organizationDelegate: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    let branchDelegate: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    let userDelegate: { findUnique: jest.Mock; create: jest.Mock };
    let hospitalStaffDelegate: { create: jest.Mock };
    let mockDatabaseService: { client: any };
    let mockJwtService: { sign: jest.Mock };

    beforeEach(async () => {
        organizationDelegate = {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
        };
        branchDelegate = {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        };
        userDelegate = { findUnique: jest.fn(), create: jest.fn() };
        hospitalStaffDelegate = { create: jest.fn() };
        mockJwtService = { sign: jest.fn().mockReturnValue('mock-token') };

        mockDatabaseService = {
            client: {
                organization: organizationDelegate,
                branch: branchDelegate,
                user: userDelegate,
                hospitalStaff: hospitalStaffDelegate,
                $transaction: jest.fn((arg) =>
                    typeof arg === 'function' ? arg(mockDatabaseService.client) : Promise.all(arg),
                ),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrganizationsService,
                { provide: DatabaseService, useValue: mockDatabaseService },
                { provide: JwtService, useValue: mockJwtService },
            ],
        }).compile();

        service = module.get<OrganizationsService>(OrganizationsService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('create (onboarding)', () => {
        it('creates org, headquarters branch, admin user and returns tokens', async () => {
            organizationDelegate.findFirst.mockResolvedValue(null);
            userDelegate.findUnique.mockResolvedValue(null);
            organizationDelegate.create.mockResolvedValue(mockOrgRecord());
            branchDelegate.create.mockResolvedValue(mockBranchRecord());
            userDelegate.create.mockResolvedValue(mockUserRecord());
            hospitalStaffDelegate.create.mockResolvedValue({});

            const result = await service.create(baseOnboardDto);

            expect(organizationDelegate.create).toHaveBeenCalledTimes(1);
            expect(branchDelegate.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ code: 'MAIN', isMainBranch: true }) }),
            );
            expect(userDelegate.create).toHaveBeenCalledTimes(1);
            expect(hospitalStaffDelegate.create).toHaveBeenCalledTimes(1);
            expect(result).toHaveProperty('organization');
            expect(result).toHaveProperty('mainBranch');
            expect(result).toHaveProperty('admin');
            expect(result).toHaveProperty('access_token');
            expect(result).toHaveProperty('refresh_token');
            expect((result.admin as any).password).toBeUndefined();
        });

        it('uses mainBranchName when provided', async () => {
            organizationDelegate.findFirst.mockResolvedValue(null);
            userDelegate.findUnique.mockResolvedValue(null);
            organizationDelegate.create.mockResolvedValue(mockOrgRecord());
            branchDelegate.create.mockResolvedValue({ ...mockBranchRecord(), name: 'Lagos HQ' });
            userDelegate.create.mockResolvedValue(mockUserRecord());
            hospitalStaffDelegate.create.mockResolvedValue({});

            await service.create({ ...baseOnboardDto, mainBranchName: 'Lagos HQ' });

            expect(branchDelegate.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ name: 'Lagos HQ' }) }),
            );
        });

        it('throws ConflictException when org name already exists', async () => {
            organizationDelegate.findFirst.mockResolvedValue(mockOrgRecord());

            await expect(service.create(baseOnboardDto)).rejects.toThrow(ConflictException);
            expect(organizationDelegate.create).not.toHaveBeenCalled();
        });

        it('throws ConflictException when admin email already registered', async () => {
            organizationDelegate.findFirst.mockResolvedValue(null);
            userDelegate.findUnique.mockResolvedValue(mockUserRecord());

            await expect(service.create(baseOnboardDto)).rejects.toThrow(ConflictException);
            expect(organizationDelegate.create).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('maps businessType and orgType onto the Prisma update input when provided', async () => {
            organizationDelegate.update.mockResolvedValue(
                mockOrgRecord({ businessType: 'PHARMACY', orgType: 'CHAIN' }),
            );

            const patch = { ...baseOrg, businessType: BusinessType.PHARMACY, orgType: OrgType.CHAIN } as UpdateOrganizationDto;
            const result = await service.update('org-1', patch);

            expect(organizationDelegate.update).toHaveBeenCalledWith({
                where: { id: 'org-1' },
                data: expect.objectContaining({ businessType: BusinessType.PHARMACY, orgType: OrgType.CHAIN }),
            });
            expect(result.businessType).toBe('PHARMACY');
            expect(result.orgType).toBe('CHAIN');
        });
    });

    describe('findOne', () => {
        it('includes businessType, orgType, and healthcare network fields on the returned DTO', async () => {
            organizationDelegate.findUnique = jest.fn().mockResolvedValue(
                mockOrgRecord({
                    businessType: 'LABORATORY',
                    orgType: 'STANDALONE',
                    healthcareNetworkId: 'net-2',
                    healthcareNetworkName: 'Reddington Hospitals',
                    paymentPlan: PaymentPlan.EPIC,
                }),
            );

            const result = await service.findOne('org-1');

            expect(result.businessType).toBe('LABORATORY');
            expect(result.orgType).toBe('STANDALONE');
            expect(result.healthcareNetworkId).toBe('net-2');
            expect(result.healthcareNetworkName).toBe('Reddington Hospitals');
        });
    });
});
