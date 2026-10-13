import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional,
    IsString, IsUUID, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import {
    AccountStatus, MemberType, OverLimitAction, PayerType, ServiceCategory, SettlementMode,
} from '@shared/enums/billing/billing.enums';

// ── Payers (PRD 10 §4.1) ─────────────────────────────────────────────────────

export class CreatePayerDto {
    @ApiProperty({ example: 'Acme Corp' }) @IsString() @MinLength(2) name!: string;
    @ApiProperty({ enum: PayerType }) @IsEnum(PayerType) payerType!: PayerType;
    @ApiProperty({ enum: SettlementMode }) @IsEnum(SettlementMode) settlementMode!: SettlementMode;
    @ApiProperty({ required: false }) @IsString() @IsOptional() contactName?: string;
    @ApiProperty({ type: [String], required: false }) @IsArray() @IsString({ each: true }) @IsOptional() phone?: string[];
    @ApiProperty({ required: false }) @IsEmail() @IsOptional() email?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
    @ApiProperty({ required: false, example: 30 }) @IsInt() @Min(0) @IsOptional() paymentTermDays?: number;

    @ApiProperty({
        required: false, example: 5000000,
        description: "Initial credit limit on the payer's account. Later changes need an approved request.",
    })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
    creditLimit?: number;
}

export class UpdatePayerDto extends PartialType(OmitType(CreatePayerDto, ['creditLimit'] as const)) {
    @ApiProperty({ enum: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED], required: false })
    @IsIn([AccountStatus.ACTIVE, AccountStatus.SUSPENDED]) @IsOptional()
    status?: AccountStatus;
}

// ── Plans (§4.2) ─────────────────────────────────────────────────────────────

export class PlanBenefitDto {
    @ApiProperty({ enum: ServiceCategory }) @IsEnum(ServiceCategory) category!: ServiceCategory;
    @ApiProperty({ default: true, description: 'false = excluded entirely' }) @IsBoolean() @IsOptional() covered?: boolean;
    @ApiProperty({ required: false, description: "Patient's share (%) for this category; overrides the plan copay" })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @IsOptional()
    copayPercent?: number;
    @ApiProperty({ required: false, description: 'Per-member annual limit within this category' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
    annualLimit?: number;
    @ApiProperty({ default: false }) @IsBoolean() @IsOptional() requiresPreAuth?: boolean;
}

export class CreatePlanDto {
    @ApiProperty({ example: 'Acme – Staff' }) @IsString() @MinLength(2) name!: string;

    @ApiProperty({ example: 10, description: "Patient's share (%) of each covered charge" })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
    copayPercent!: number;

    @ApiProperty({ required: false }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional() annualLimitPerMember?: number;
    @ApiProperty({ required: false, description: 'Family-wide cap' }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional() annualLimitPerPolicy?: number;
    @ApiProperty({ enum: OverLimitAction, required: false }) @IsEnum(OverLimitAction) @IsOptional() overLimitAction?: OverLimitAction;
    @ApiProperty({ required: false, default: 0 }) @IsInt() @Min(0) @IsOptional() maxSpouses?: number;
    @ApiProperty({ required: false, default: 0 }) @IsInt() @Min(0) @IsOptional() maxChildren?: number;
    @ApiProperty({ required: false, example: 18 }) @IsInt() @Min(0) @IsOptional() childMaxAge?: number;
    @ApiProperty({ required: false, default: false }) @IsBoolean() @IsOptional() allowOtherDependants?: boolean;

    @ApiProperty({ type: [PlanBenefitDto], required: false, description: 'Category rules; categories not listed are covered at the plan copay' })
    @IsArray() @ValidateNested({ each: true }) @Type(() => PlanBenefitDto) @IsOptional()
    benefits?: PlanBenefitDto[];
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
    @ApiProperty({ enum: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED], required: false })
    @IsIn([AccountStatus.ACTIVE, AccountStatus.SUSPENDED]) @IsOptional()
    status?: AccountStatus;
}

// ── Policies & coverage (§4.3, §4.4) ─────────────────────────────────────────

export class EnrolPolicyDto {
    @ApiProperty({ example: 'ACME-4471', description: 'HMO policy no., staff ID or NHIS no.' }) @IsString() policyNumber!: string;
    @ApiProperty() @IsUUID() principalPatientId!: string;
    @ApiProperty({ example: '2026-04-01' }) @IsDateString() validFrom!: string;
    @ApiProperty({ required: false }) @IsDateString() @IsOptional() validTo?: string;
    @ApiProperty({ required: false, description: "Principal's enrollee number" }) @IsString() @IsOptional() memberNumber?: string;
    @ApiProperty({ required: false, default: 1 }) @IsInt() @Min(1) @IsOptional() priority?: number;
}

export class AddCoverageDto {
    @ApiProperty() @IsUUID() patientId!: string;

    @ApiProperty({ enum: [MemberType.SPOUSE, MemberType.CHILD, MemberType.OTHER_DEPENDANT] })
    @IsIn([MemberType.SPOUSE, MemberType.CHILD, MemberType.OTHER_DEPENDANT])
    memberType!: MemberType;

    @ApiProperty({ required: false }) @IsString() @IsOptional() memberNumber?: string;
    @ApiProperty({ required: false, description: 'Defaults to today' }) @IsDateString() @IsOptional() validFrom?: string;
    @ApiProperty({ required: false, description: "Defaults to the policy's end (or a child's age-out date)" }) @IsDateString() @IsOptional() validTo?: string;
    @ApiProperty({ required: false, default: 1 }) @IsInt() @Min(1) @IsOptional() priority?: number;
}

export class SetCoveragePriorityDto {
    @ApiProperty({ type: [String], description: "The patient's coverage ids, highest priority first" })
    @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
    coverageIds!: string[];
}
