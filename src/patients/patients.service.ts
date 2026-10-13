import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { withConstraintErrors } from '../database/prisma-errors';
import { CreatePatientDto } from '@shared/contracts/patients';
import { $Enums } from '../../generated/prisma/client';
import { BillingAccountsService } from '../billing/accounts/billing-accounts.service';
import { ChargesService } from '../billing/charges/charges.service';
import { toDecimal } from '../billing/ledger/ledger.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { generateTemporaryPassword } from '../auth/temporary-password';

const BILLING_ACCOUNT_SUMMARY = {
    where: { leftAt: null },
    select: {
        account: {
            select: {
                id: true, accountNumber: true, accountType: true, name: true, status: true,
                balance: true, unappliedCredit: true,
            },
        },
    },
};

const PATIENT_INCLUDE = {
    user: {
        select: {
            id: true, email: true, firstName: true, middleName: true,
            lastName: true, phone: true, status: true, createdAt: true,
        },
    },
    billingMemberships: BILLING_ACCOUNT_SUMMARY,
    emergencyContact: true,
};

const REGISTRATION_SOURCE = 'PATIENT_REGISTRATION';

@Injectable()
export class PatientsService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly billingAccounts: BillingAccountsService,
        private readonly charges: ChargesService,
    ) {}

    // ── Step 1: Personal Info ────────────────────────────────────────────────

    /**
     * Registers the patient at the staff member's branch (both from their token), opens or joins
     * their billing account, and bills the registration and card fees in the same transaction.
     * The fees are incurred now; paying them is a separate step at Accounts (10 §7.2). Any credit
     * already on the account pays them immediately; otherwise they stay owed.
     */
    async create(dto: CreatePatientDto, at: { organizationId: string; branchId: string }, registeredBy: string) {
        // Email is optional for patients — generate a stable internal placeholder if omitted
        const email = dto.email ?? `${uuidv4()}@patient.internal`;

        const plainPassword = generateTemporaryPassword();
        const [hashed, fees] = await Promise.all([
            bcrypt.hash(plainPassword, 10),
            this.databaseService.client.organization.findUniqueOrThrow({
                where:  { id: at.organizationId },
                select: { registrationFee: true, nfcCardFee: true },
            }),
        ]);

        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;

            // The unique index on email rejects duplicates; no pre-check query
            const user = await withConstraintErrors(
                () => client.user.create({
                    data: {
                        email,
                        password: hashed,
                        mustChangePassword: true,   // a temporary password, shown once (09 §3)
                        firstName: dto.firstName,
                        middleName: dto.middleName,
                        lastName: dto.lastName,
                        phone: dto.phone,
                        type: $Enums.UserType.PATIENT,
                        status: $Enums.UserStatus.ACTIVE,
                    },
                    select: {
                        id: true, email: true, firstName: true, middleName: true,
                        lastName: true, phone: true, status: true, createdAt: true,
                    },
                }),
                { conflict: 'A user with this email already exists' },
            );

            const patient = await client.patient.create({
                data: {
                    id: user.id,
                    hospitalId: at.organizationId,
                    branchId: at.branchId,
                    nfcId: uuidv4(),
                    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
                    sex: dto.sex as $Enums.Gender | undefined,
                },
            });

            // Every patient has exactly one billing account from the moment they exist (PRD 10 §3.2)
            const billingAccountId = dto.billingAccountId
                ? (await this.billingAccounts.moveMember(dto.billingAccountId, user.id, registeredBy, at.organizationId)).accountId
                : (await this.billingAccounts.openIndividualForPatient({
                    patientId: user.id,
                    organizationId: at.organizationId,
                    name:  `${user.firstName} ${user.lastName}`,
                    phone: user.phone,
                }, registeredBy)).id;

            // Registration fees are incurred at registration. A fee the organisation sets to 0 isn't billed.
            const billable = [
                { description: 'Registration fee', unitPrice: fees.registrationFee },
                { description: 'NFC card fee',     unitPrice: fees.nfcCardFee },
            ].filter(fee => fee.unitPrice.gt(0));

            const charges = [];
            let account;
            for (const fee of billable) {
                const posted = await this.charges.post({
                    patientId:        user.id,
                    branchId:         at.branchId,
                    billingAccountId,
                    category:         $Enums.ServiceCategory.REGISTRATION,
                    description:      fee.description,
                    unitPrice:        fee.unitPrice.toString(),
                    sourceType:       REGISTRATION_SOURCE,
                    sourceId:         user.id,
                    createdBy:        registeredBy,
                }, account);
                account = posted.account;
                charges.push({ ...posted.charge, allocations: posted.allocations });
            }

            // What the patient must settle at Accounts before services that require payment (11 §6)
            const outstanding = charges
                .flatMap(c => c.allocations)
                .reduce((sum, a) => sum.plus(a.amount.minus(a.paidAmount)), toDecimal(0));

            return {
                ...patient,
                user,
                billingAccount: { id: billingAccountId, balance: account?.balance, unappliedCredit: account?.unappliedCredit },
                charges,
                outstanding,
                temporaryPassword: plainPassword,
            };
        });
    }

    // ── Step 2: Medical Profile ──────────────────────────────────────────────

    async updateMedical(id: string, dto: UpdateMedicalDto) {
        const patient = await this.databaseService.client.patient.findUnique({ where: { id } });
        if (!patient) throw new NotFoundException('Patient not found');

        return this.databaseService.client.patient.update({
            where: { id },
            data: {
                bloodGroup:      dto.bloodGroup  as $Enums.BloodGroup  | undefined,
                genotype:        dto.genotype    as $Enums.Genotype    | undefined,
                maritalStatus:   dto.maritalStatus as $Enums.MaritalStatus | undefined,
                nationality:     dto.nationality,
                occupation:      dto.occupation,
                religion:        dto.religion,
                ethnicity:       dto.ethnicity,
                spokenLanguages: dto.spokenLanguages,
            },
            include: PATIENT_INCLUDE,
        });
    }

    // ── Step 3: Address ──────────────────────────────────────────────────────

    async addAddress(patientId: string, dto: AddAddressDto) {
        const patient = await this.databaseService.client.patient.findUnique({ where: { id: patientId } });
        if (!patient) throw new NotFoundException('Patient not found');

        return this.databaseService.client.address.upsert({
            where: { userId_type: { userId: patientId, type: dto.type as $Enums.AddressType } },
            create: { ...dto, type: dto.type as $Enums.AddressType, userId: patientId },
            update: { ...dto, type: dto.type as $Enums.AddressType },
        });
    }

    // ── Step 4: Next of Kin ──────────────────────────────────────────────────

    async addNextOfKin(patientId: string, dto: AddNextOfKinDto) {
        const patient = await this.databaseService.client.patient.findUnique({ where: { id: patientId } });
        if (!patient) throw new NotFoundException('Patient not found');

        // Only one emergency contact allowed
        if (dto.isEmergencyContact) {
            await this.databaseService.client.nextOfKin.updateMany({
                where: { patientId, isEmergencyContact: true },
                data:  { isEmergencyContact: false },
            });
        }

        return this.databaseService.client.nextOfKin.create({
            data: { ...dto, patientId },
        });
    }

    // ── Lookups ───────────────────────────────────────────────────────────────

    async findAll(organizationId: string, limit = 20, offset = 0, search?: string) {
        const userWhere: any = { deletedAt: null, type: $Enums.UserType.PATIENT };

        if (search) {
            userWhere.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName:  { contains: search, mode: 'insensitive' } },
                { phone:     { has: search } },
            ];
        }

        const [count, docs] = await this.databaseService.client.$transaction([
            this.databaseService.client.patient.count({ where: { hospitalId: organizationId, user: userWhere } }),
            this.databaseService.client.patient.findMany({
                where: { hospitalId: organizationId, user: userWhere },
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    patientId: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true, firstName: true, middleName: true, lastName: true,
                            phone: true, status: true,
                        },
                    },
                    billingMemberships: BILLING_ACCOUNT_SUMMARY,
                },
            }),
        ]);

        return { count, docs };
    }

    async findOne(id: string, organizationId: string) {
        const patient = await this.databaseService.client.patient.findFirst({
            where: { id, hospitalId: organizationId },
            include: {
                ...PATIENT_INCLUDE,
                user: {
                    select: {
                        id: true, email: true, firstName: true, middleName: true,
                        lastName: true, phone: true, status: true,
                        createdAt: true, address: true,
                    },
                },
            },
        });
        if (!patient) throw new NotFoundException('Patient not found');
        return patient;
    }
}

// ── Inline step DTOs ──────────────────────────────────────────────────────────
import { IsEnum, IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BLOOD_GROUP, GENOTYPE, MaritalStatus, AddressType } from '@shared/enums/users/user.enums';

export class UpdateMedicalDto {
    @ApiProperty({ enum: BLOOD_GROUP,    required: false }) @IsEnum(BLOOD_GROUP)    @IsOptional() bloodGroup?:    BLOOD_GROUP;
    @ApiProperty({ enum: GENOTYPE,       required: false }) @IsEnum(GENOTYPE)       @IsOptional() genotype?:      GENOTYPE;
    @ApiProperty({ enum: MaritalStatus,  required: false }) @IsEnum(MaritalStatus)  @IsOptional() maritalStatus?: MaritalStatus;
    @ApiProperty({ required: false })                       @IsString()             @IsOptional() nationality?:   string;
    @ApiProperty({ required: false })                       @IsString()             @IsOptional() occupation?:    string;
    @ApiProperty({ required: false })                       @IsString()             @IsOptional() religion?:      string;
    @ApiProperty({ required: false })                       @IsString()             @IsOptional() ethnicity?:     string;
    @ApiProperty({ type: [String],       required: false }) @IsArray() @IsString({ each: true }) @IsOptional() spokenLanguages?: string[];
}

export class AddAddressDto {
    @ApiProperty() @IsString() street!: string;
    @ApiProperty() @IsString() city!:   string;
    @ApiProperty() @IsString() state!:  string;
    @ApiProperty() @IsString() country!: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() postalCode?: string;
    @ApiProperty({ enum: AddressType, default: AddressType.RESIDENCE }) @IsEnum(AddressType) type!: AddressType;
}

export class AddNextOfKinDto {
    @ApiProperty() @IsString() firstName!:    string;
    @ApiProperty() @IsString() middleName!:   string;
    @ApiProperty() @IsString() lastName!:     string;
    @ApiProperty() @IsString() relationship!: string;
    @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) phone!: string[];
    @ApiProperty({ required: false }) @IsString() @IsOptional() email?:   string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
    @ApiProperty({ default: false }) @IsBoolean() @IsOptional() isEmergencyContact?: boolean;
}
