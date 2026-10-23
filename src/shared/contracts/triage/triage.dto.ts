import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    ArrayUnique, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { QueuePriority } from '@shared/enums/encounters/encounter.enums';
import { Avpu, DangerSign, VitalsContext } from '@shared/enums/triage/triage.enums';

// "true" / "false" in a query string
const bool = ({ value }: { value: unknown }) => value === true || value === 'true';

// ── Vitals (11 §9) ───────────────────────────────────────────────────────────
// The limits catch typos (385 for 38.5), not abnormal values: an abnormal reading is recorded as taken.

export class RecordVitalsDto {
    @ApiProperty({ type: String, format: 'date-time', description: 'When the reading was taken, not when it was typed' })
    @Type(() => Date) @IsDate()
    takenAt!: Date;

    @ApiProperty({ enum: VitalsContext, required: false, default: VitalsContext.TRIAGE })
    @IsEnum(VitalsContext) @IsOptional()
    context?: VitalsContext;

    @ApiProperty({ required: false, example: 37.8, description: '°C, 30–45' })
    @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(45) @IsOptional()
    temperature?: number;

    @ApiProperty({ required: false, example: 96, description: 'bpm, 20–250' })
    @IsInt() @Min(20) @Max(250) @IsOptional()
    pulse?: number;

    @ApiProperty({ required: false, example: 20, description: '/min, 4–90' })
    @IsInt() @Min(4) @Max(90) @IsOptional()
    respiratoryRate?: number;

    @ApiProperty({ required: false, example: 120, description: 'mmHg, 40–260; with diastolic' })
    @IsInt() @Min(40) @Max(260) @IsOptional()
    systolic?: number;

    @ApiProperty({ required: false, example: 80, description: 'mmHg, 20–160; with systolic' })
    @IsInt() @Min(20) @Max(160) @IsOptional()
    diastolic?: number;

    @ApiProperty({ required: false, example: 98, description: '%, 50–100' })
    @IsInt() @Min(50) @Max(100) @IsOptional()
    spo2?: number;

    @ApiProperty({ required: false, example: 4, description: '0–10' })
    @IsInt() @Min(0) @Max(10) @IsOptional()
    painScore?: number;

    @ApiProperty({ required: false, example: 5.6, description: 'mmol/L, 1–35' })
    @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(35) @IsOptional()
    bloodGlucose?: number;

    @ApiProperty({ required: false, example: 18.4, description: 'kg, 0.3–350' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.3) @Max(350) @IsOptional()
    weight?: number;

    @ApiProperty({ required: false, example: 112, description: 'cm, 20–250' })
    @IsNumber({ maxDecimalPlaces: 1 }) @Min(20) @Max(250) @IsOptional()
    height?: number;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(1000) @IsOptional()
    notes?: string;
}

/** A correction: only the fields that change, plus why. The reading is saved anew, replacing the old one. */
export class CorrectVitalsDto extends PartialType(OmitType(RecordVitalsDto, ['context'] as const)) {
    @ApiProperty({ example: 'Temperature typed as 38.5, was 37.5' })
    @IsString() @IsNotEmpty() @MaxLength(500)
    editReason!: string;
}

export class RemoveVitalsDto {
    @ApiProperty({ example: 'Recorded against the wrong patient' })
    @IsString() @IsNotEmpty() @MaxLength(500)
    reason!: string;
}

export class VitalsQueryDto {
    @ApiProperty({ enum: VitalsContext, required: false })
    @IsEnum(VitalsContext) @IsOptional()
    context?: VitalsContext;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'Taken from (inclusive)' })
    @Type(() => Date) @IsDate() @IsOptional()
    from?: Date;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'Taken up to (inclusive)' })
    @Type(() => Date) @IsDate() @IsOptional()
    to?: Date;

    @ApiProperty({ required: false, default: true, description: 'Show removed readings (struck through)' })
    @Transform(bool) @IsBoolean() @IsOptional()
    includeRemoved: boolean = true;

    @ApiProperty({ required: false, default: false, description: 'Show readings replaced by a correction' })
    @Transform(bool) @IsBoolean() @IsOptional()
    includeReplaced: boolean = false;

    @ApiProperty({ required: false, default: 20 })
    @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
    limit: number = 20;

    @ApiProperty({ required: false, default: 0 })
    @Type(() => Number) @IsInt() @Min(0) @IsOptional()
    offset: number = 0;
}

// ── Triage assessment (11 §8) ────────────────────────────────────────────────

export class RecordTriageDto {
    @ApiProperty({ example: 'Fever for 2 days, poor feeding', description: "Becomes the encounter's reason for visit" })
    @IsString() @IsNotEmpty() @MaxLength(500)
    presentingComplaint!: string;

    @ApiProperty({ required: false, example: '2 days ago' })
    @IsString() @MaxLength(200) @IsOptional()
    onset?: string;

    @ApiProperty({ required: false, example: 'Abdomen, lower right' })
    @IsString() @MaxLength(200) @IsOptional()
    painLocation?: string;

    @ApiProperty({ enum: Avpu, description: 'Level of consciousness' })
    @IsEnum(Avpu)
    avpu!: Avpu;

    @ApiProperty({ enum: DangerSign, isArray: true, required: false, default: [] })
    @IsArray() @ArrayUnique() @IsEnum(DangerSign, { each: true }) @IsOptional()
    dangerSigns?: DangerSign[];

    @ApiProperty({ enum: QueuePriority, description: "The nurse's decision; given to the encounter's tasks" })
    @IsEnum(QueuePriority)
    priority!: QueuePriority;

    @ApiProperty({ enum: QueuePriority, required: false, description: "What the hospital's protocol suggested, kept beside the decision" })
    @IsEnum(QueuePriority) @IsOptional()
    suggestedPriority?: QueuePriority;

    @ApiProperty({ required: false, description: 'Required when the encounter was already triaged: why it is re-triaged or corrected' })
    @IsString() @MaxLength(500) @IsOptional()
    changeReason?: string;
}
