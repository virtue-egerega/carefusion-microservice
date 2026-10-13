import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { withConstraintErrors } from '../database/prisma-errors';
import { CreatePatientDto } from '@shared/contracts/patients';
import { $Enums } from '../../generated/prisma/client';
import { BillingAccountsService } from '../billing/billing-accounts.service';
import { ChargesService } from '../billing/charges.service';
import { LedgerService, toDecimal } from '../billing/ledger.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

function generatePassword(): string {
    const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower  = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const syms   = '!@#$%^&*';
    const all    = upper + lower + digits + syms;
    const rand   = (set: string) => set[crypto.randomInt(set.length)];
    const rest   = Array.from({ length: 6 }, () => rand(all)).join('');
    return [rand(upper), rand(lower), rand(digits), rand(syms), ...rest]
        .sort(() => Math.random() - 0.5)
        .join('');
}

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
        private readonly ledger: LedgerService,
    ) {}

    // ── Step 1: Personal Info ────────────────────────────────────────────────

    /** organizationId comes from the registering staff member's token. */
    async create(dto: CreatePatientDto, organizationId: string, registeredBy: string) {
        // Email is optional for patients — generate a stable internal placeholder if omitted
        const email = dto.email ?? `${uuidv4()}@patient.internal`;

        const plainPassword = generatePassword();
        const hashed        = await bcrypt.hash(plainPassword, 10);

        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;

            // The unique index on email rejects duplicates; no pre-check query
            const user = await withConstraintErrors(
                () => client.user.create({
                    data: {
                        email,
                        password: hashed,
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
                    hospitalId: organizationId,
                    nfcId: uuidv4(),
                    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
                    sex: dto.sex as $Enums.Gender | undefined,
                },
            });

            // Every patient has exactly one billing account from the moment they exist (PRD 10 §3.2)
            const billing = dto.billingAccountId
                ? await this.billingAccounts.moveMember(dto.billingAccountId, user.id, registeredBy, organizationId)
                : await this.billingAccounts.openIndividualForPatient({
                    patientId: user.id,
                    organizationId,
                    name:  `${user.firstName} ${user.lastName}`,
                    phone: user.phone,
                }, registeredBy);

            return { ...patient, user, billingAccount: billing, temporaryPassword: plainPassword };
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

    // ── Step 5: Registration Payment ─────────────────────────────────────────

    /**
     * Deposit (if any) into the patient's billing account, then post the card and registration
     * fees as charges. Prepaid credit pays them immediately; any shortfall stays owed and puts the
     * patient in the Cashier queue (PRD 10 §6.6).
     */
    async registerPayment(patientId: string, dto: RegistrationPaymentDto, organizationId: string, receivedBy: string) {
        // One read: fees, current account, and whether registration was already charged
        const patient = await this.databaseService.client.patient.findFirst({
            where: { id: patientId, hospitalId: organizationId },
            select: {
                hospital:           { select: { registrationFee: true, nfcCardFee: true } },
                billingMemberships: { where: { leftAt: null }, select: { accountId: true } },
                charges: {
                    where:  { sourceType: REGISTRATION_SOURCE, status: $Enums.ChargeStatus.POSTED },
                    select: { id: true },
                    take:   1,
                },
            },
        });
        if (!patient) throw new NotFoundException('Patient not found');
        if (patient.charges.length) throw new ConflictException('Registration fees have already been charged');

        const accountId = patient.billingMemberships[0]?.accountId;
        if (!accountId) throw new ConflictException('Patient has no billing account');

        return this.databaseService.transaction(async () => {
            let account = await this.ledger.lockAccount(accountId, organizationId);

            if (dto.amount > 0) {
                ({ account } = await withConstraintErrors(
                    () => this.ledger.postEntry({
                        accountId,
                        entryType:     $Enums.AccountEntryType.DEPOSIT,
                        amount:        toDecimal(dto.amount),
                        modeOfPayment: dto.modeOfPayment as $Enums.PaymentMode,
                        reference:     dto.paymentReference,
                        description:   'Registration deposit',
                        branchId:      dto.branchId,
                        createdBy:     receivedBy,
                    }, account),
                    { notFound: 'Branch not found' },
                ));
            }

            const fees = [
                { description: 'NFC card fee',     unitPrice: patient.hospital.nfcCardFee },
                { description: 'Registration fee', unitPrice: patient.hospital.registrationFee },
            ];
            const charges = [];
            for (const fee of fees) {
                const posted = await this.charges.post({
                    patientId,
                    branchId:    dto.branchId,
                    category:    $Enums.ServiceCategory.REGISTRATION,
                    description: fee.description,
                    unitPrice:   fee.unitPrice.toString(),
                    sourceType:  REGISTRATION_SOURCE,
                    sourceId:    patientId,
                    createdBy:   receivedBy,
                }, account);
                account = posted.account;
                charges.push({ ...posted.charge, allocations: posted.allocations });
            }

            return {
                charges,
                billingAccount: {
                    id:              account.id,
                    accountNumber:   account.accountNumber,
                    balance:         account.balance,
                    unappliedCredit: account.unappliedCredit,
                },
            };
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
import { IsEnum, IsOptional, IsString, IsArray, IsBoolean, IsNumber, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BLOOD_GROUP, GENOTYPE, MaritalStatus, AddressType } from '@shared/enums/users/user.enums';
import { PaymentMode } from '@shared/enums/billing/billing.enums';

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

export class RegistrationPaymentDto {
    @ApiProperty({ example: 5000, description: 'Amount received now; 0 leaves the fees owed' }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
    @ApiProperty({ enum: PaymentMode }) @IsEnum(PaymentMode) modeOfPayment!: PaymentMode;
    @ApiProperty({ required: false }) @IsString() @IsOptional() paymentReference?: string;
    @ApiProperty({ description: 'Branch where the patient is being registered' }) @IsUUID() branchId!: string;
}
