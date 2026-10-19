import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { isUniqueViolation, withConstraintErrors } from '../database/prisma-errors';
import { CreatePatientDto } from '@shared/contracts/patients';
import { $Enums, Prisma } from '../../generated/prisma/client';
import { BillingAccountsService } from '../billing/accounts/billing-accounts.service';
import { ChargesService } from '../billing/charges/charges.service';
import { toDecimal } from '../billing/ledger/ledger.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { generateTemporaryPassword } from '../auth/temporary-password';
import { AGE_SETTINGS_SELECT, AgeSettings, ageGroup } from './age-group';
import { PatientNumbers } from './patient-numbers';

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

// A taken patient number only happens if a second API process is writing; each retry moves past it
const PATIENT_NUMBER_ATTEMPTS = 3;

/** The patient insert hit a number another process already used; the whole registration is retried. */
class PatientNumberTaken extends Error {}

// The organisation's age settings, joined into patient reads so the age group needs no extra query
const AGE_SETTINGS = { select: AGE_SETTINGS_SELECT };

/** Replaces the joined settings with the patient's computed age group (06 §2.7). */
function withAgeGroup<T extends { dateOfBirth: Date | null; hospital: AgeSettings }>(patient: T) {
    const { hospital, ...rest } = patient;
    return { ...rest, ageGroup: ageGroup(patient.dateOfBirth, new Date(), hospital) };
}

@Injectable()
export class PatientsService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly billingAccounts: BillingAccountsService,
        private readonly charges: ChargesService,
        private readonly patientNumbers: PatientNumbers,
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
                select: { registrationFee: true, nfcCardFee: true, patientNumberStart: true, ...AGE_SETTINGS_SELECT },
            }),
        ]);

        // A failed statement aborts the Postgres transaction, so a taken number retries the whole registration
        for (let attempt = 1; ; attempt++) {
            try {
                return await this.register(dto, at, registeredBy, { email, hashed, plainPassword, fees });
            } catch (e) {
                if (!(e instanceof PatientNumberTaken)) throw e;
                if (attempt === PATIENT_NUMBER_ATTEMPTS) {
                    throw new ServiceUnavailableException('Could not assign a patient number. Please try again.');
                }
            }
        }
    }

    private register(
        dto: CreatePatientDto,
        at: { organizationId: string; branchId: string },
        registeredBy: string,
        prepared: { email: string; hashed: string; plainPassword: string; fees: AgeSettings & { registrationFee: Prisma.Decimal; nfcCardFee: Prisma.Decimal; patientNumberStart: number } },
    ) {
        const { email, hashed, plainPassword, fees } = prepared;

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

            // The patient's hospital number, from memory (no query). Taken as late as possible, so
            // failures before this point (e.g. duplicate email) don't use up a number.
            const patient = await client.patient.create({
                data: {
                    id: user.id,
                    patientNumber: this.patientNumbers.next(at.organizationId, fees.patientNumberStart),
                    hospitalId: at.organizationId,
                    branchId: at.branchId,
                    // nfcId stays empty until a physical card is scanned and linked
                    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
                    sex: dto.sex as $Enums.Gender | undefined,
                },
            }).catch(e => {
                // id is the new user's id, so the only unique value that can collide is the number
                throw isUniqueViolation(e) ? new PatientNumberTaken() : e;
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
                ageGroup: ageGroup(patient.dateOfBirth, new Date(), fees),
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
        const where: any = { hospitalId: organizationId, user: { deletedAt: null, type: $Enums.UserType.PATIENT } };

        if (search) {
            where.OR = [
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName:  { contains: search, mode: 'insensitive' } } },
                { user: { phone:     { has: search } } },
                // A number search, e.g. 10001
                ...(/^\d{1,9}$/.test(search) ? [{ patientNumber: Number(search) }] : []),
                { billingMemberships: { some: { leftAt: null, account: { accountNumber: { contains: search, mode: 'insensitive' } } } } },
            ];
        }

        const [count, docs] = await this.databaseService.client.$transaction([
            this.databaseService.client.patient.count({ where }),
            this.databaseService.client.patient.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    patientNumber: true,
                    dateOfBirth: true,
                    sex: true,
                    createdAt: true,
                    hospital: AGE_SETTINGS,
                    user: {
                        select: { firstName: true, middleName: true, lastName: true, phone: true, status: true },
                    },
                    billingMemberships: {
                        where:  { leftAt: null },
                        select: { account: { select: { id: true, accountNumber: true, accountType: true, balance: true } } },
                    },
                },
            }),
        ]);

        // One flat row per patient: what a patients list shows
        return {
            count,
            docs: docs.map(doc => {
                const { user, billingMemberships, ...patient } = withAgeGroup(doc);
                return {
                    ...patient,
                    ...user,
                    billingAccount: billingMemberships[0]?.account ?? null,
                    lastVisit: null,   // filled from encounters once they exist (11 §4)
                };
            }),
        };
    }

    /**
     * Header figures for the patients list, in one query. Months are calendar months in UTC.
     * Growth is this month's registrations against last month's, as a percentage; null when last
     * month had none (no meaningful percentage). currentlyAdmitted and recordsNeedingReview are
     * null until admissions (11 §12) and a definition of "needs review" exist.
     */
    async stats(organizationId: string) {
        const [row] = await this.databaseService.client.$queryRaw<{ total: number; newThisMonth: number; newLastMonth: number }[]>`
            SELECT count(*)::int AS total,
                   count(*) FILTER (WHERE p."createdAt" >= date_trunc('month', now() AT TIME ZONE 'UTC'))::int AS "newThisMonth",
                   count(*) FILTER (WHERE p."createdAt" >= date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 month'
                                      AND p."createdAt" <  date_trunc('month', now() AT TIME ZONE 'UTC'))::int AS "newLastMonth"
              FROM "Patient" p
              JOIN "User" u ON u.id = p.user_id
             WHERE p.hospital_id = ${organizationId} AND u."deletedAt" IS NULL`;

        return {
            total:                row.total,
            newThisMonth:         row.newThisMonth,
            newLastMonth:         row.newLastMonth,
            newThisMonthGrowth:   row.newLastMonth === 0
                ? null
                : Math.round(((row.newThisMonth - row.newLastMonth) / row.newLastMonth) * 1000) / 10,
            currentlyAdmitted:    null,
            recordsNeedingReview: null,
        };
    }

    async findOne(id: string, organizationId: string) {
        const patient = await this.databaseService.client.patient.findFirst({
            where: { id, hospitalId: organizationId },
            include: {
                ...PATIENT_INCLUDE,
                hospital: AGE_SETTINGS,
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
        return withAgeGroup(patient);
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
