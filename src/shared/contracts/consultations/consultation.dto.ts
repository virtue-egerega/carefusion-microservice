import { ApiProperty, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
    ValidateNested,
} from 'class-validator';
import {
    AlcoholUse, BodySystem, ConsultationKind, ConsultationOutcome, ConsultationStatus, DiagnosisCertainty, DiagnosisCodeSystem,
    ExamFinding, GeneralSign, MedicationAdherence, ReviewFinding, SmokingStatus,
} from '@shared/enums/consultations/consultation.enums';

// A section is saved by sending it; null clears it; leaving it out keeps what's saved (PATCH).
const NOTE = 10000;   // narrative sections
const SHORT = 500;    // one-line fields

// "true" / "false" in a query string
const bool = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

// ── Starting (14 §2) ─────────────────────────────────────────────────────────

export class StartConsultationDto {
    @ApiProperty({ enum: ConsultationKind, required: false, default: ConsultationKind.INITIAL })
    @IsEnum(ConsultationKind) @IsOptional()
    type?: ConsultationKind;

    @ApiProperty({ required: false, description: "The doctor's task being served (IN_SERVICE, on this encounter). Omit for a ward round" })
    @IsUUID() @IsOptional()
    queueEntryId?: string;
}

// ── Repeating parts, sent as whole lists (14 §3.1, §3.3, §4) ─────────────────

export class ComplaintDto {
    @ApiProperty({ example: 'Fever' })
    @IsString() @IsNotEmpty() @MaxLength(SHORT)
    complaint!: string;

    @ApiProperty({ required: false, example: '3 days' })
    @IsString() @MaxLength(100) @IsOptional()
    duration?: string;
}

/** A symptom asked about in the review of systems (14 §3.3). One not asked about is left out: not assessed. */
export class ReviewFindingDto {
    @ApiProperty({ example: 'HAEMOPTYSIS', description: 'A code from GET /review-of-systems' })
    @IsString() @IsNotEmpty() @MaxLength(60)
    symptom!: string;

    @ApiProperty({ enum: ReviewFinding, description: 'POSITIVE: has it. NEGATIVE: asked, and denies it' })
    @IsEnum(ReviewFinding)
    finding!: ReviewFinding;

    @ApiProperty({ required: false, example: 'Productive, 2 weeks' })
    @IsString() @MaxLength(SHORT) @IsOptional()
    note?: string;
}

/** A body system's note in the review of systems or the examination: anything not on the list. */
export class SystemNoteDto {
    @ApiProperty({ enum: BodySystem })
    @IsEnum(BodySystem)
    system!: BodySystem;

    @ApiProperty({ example: 'Snores at night' })
    @IsString() @IsNotEmpty() @MaxLength(NOTE)
    note!: string;
}

/** An item examined in the systemic examination (14 §4.2). One not examined is left out. */
export class ExamFindingDto {
    @ApiProperty({ example: 'MURMURS', description: 'A code from GET /examination' })
    @IsString() @IsNotEmpty() @MaxLength(60)
    element!: string;

    @ApiProperty({ enum: ExamFinding })
    @IsEnum(ExamFinding)
    finding!: ExamFinding;

    @ApiProperty({ required: false, example: 'Pansystolic murmur at the apex, grade 3/6', description: 'Required when ABNORMAL' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    note?: string;
}

export class GeneralSignDto {
    @ApiProperty({ enum: GeneralSign })
    @IsEnum(GeneralSign)
    sign!: GeneralSign;

    @ApiProperty({ description: 'false = documented absent' })
    @IsBoolean()
    present!: boolean;

    @ApiProperty({ required: false, minimum: 1, maximum: 3, description: '+ to +++, on a present sign' })
    @IsInt() @Min(1) @Max(3) @IsOptional()
    grade?: number;

    @ApiProperty({ required: false, example: 'Pitting to mid-shin' })
    @IsString() @MaxLength(SHORT) @IsOptional()
    note?: string;
}

// ── Saving the draft (14 §3–§6) ──────────────────────────────────────────────

export class UpdateConsultationDto {
    @ApiProperty({ required: false, type: [ComplaintDto], description: 'The whole list, in order; replaces the saved one' })
    @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ComplaintDto) @IsOptional()
    complaints?: ComplaintDto[] | null;

    @ApiProperty({ required: false, description: 'History of presenting complaint' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    presentingHistory?: string | null;

    @ApiProperty({ required: false, type: [ReviewFindingDto], description: 'Review of systems: every symptom asked about, positive or negative; the whole list' })
    @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ReviewFindingDto) @IsOptional()
    reviewFindings?: ReviewFindingDto[] | null;

    @ApiProperty({ required: false, type: [SystemNoteDto], description: 'Review of systems: a note per body system; the whole list' })
    @IsArray() @ArrayMaxSize(16) @ValidateNested({ each: true }) @Type(() => SystemNoteDto) @IsOptional()
    systemReviews?: SystemNoteDto[] | null;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(NOTE) @IsOptional()
    pastSurgicalHistory?: string | null;

    @ApiProperty({ required: false, description: 'What the patient takes, including herbal and over-the-counter' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    currentMedications?: string | null;

    @ApiProperty({ required: false, enum: MedicationAdherence })
    @IsEnum(MedicationAdherence) @IsOptional()
    adherence?: MedicationAdherence | null;

    @ApiProperty({ required: false, example: "Can't afford the full month" })
    @IsString() @MaxLength(SHORT) @IsOptional()
    adherenceNote?: string | null;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(NOTE) @IsOptional()
    socialHistory?: string | null;

    @ApiProperty({ required: false, enum: SmokingStatus })
    @IsEnum(SmokingStatus) @IsOptional()
    smoking?: SmokingStatus | null;

    @ApiProperty({ required: false, enum: AlcoholUse })
    @IsEnum(AlcoholUse) @IsOptional()
    alcohol?: AlcoholUse | null;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(NOTE) @IsOptional()
    familyHistory?: string | null;

    // children (14 §3.8)
    @ApiProperty({ required: false, description: 'Children only' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    birthHistory?: string | null;

    @ApiProperty({ required: false, description: 'Children only' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    immunisationHistory?: string | null;

    @ApiProperty({ required: false, description: 'Children only' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    developmentHistory?: string | null;

    @ApiProperty({ required: false, description: 'Children only' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    feedingHistory?: string | null;

    // women of reproductive age (14 §3.8)
    @ApiProperty({ required: false, type: String, format: 'date', description: 'Women only. Not in the future' })
    @Type(() => Date) @IsDate() @IsOptional()
    lastMenstrualPeriod?: Date | null;

    @ApiProperty({ required: false, minimum: 0, description: 'Women only. Pregnancies' })
    @IsInt() @Min(0) @Max(30) @IsOptional()
    gravida?: number | null;

    @ApiProperty({ required: false, minimum: 0, description: 'Women only. Births after 28 weeks' })
    @IsInt() @Min(0) @Max(30) @IsOptional()
    parity?: number | null;

    @ApiProperty({ required: false, minimum: 0, description: 'Women only. Losses before 28 weeks' })
    @IsInt() @Min(0) @Max(30) @IsOptional()
    abortions?: number | null;

    @ApiProperty({ required: false, description: 'Women only' })
    @IsString() @MaxLength(SHORT) @IsOptional()
    contraception?: string | null;

    // examination (14 §4)
    @ApiProperty({ required: false, type: [GeneralSignDto], description: 'General examination checklist: the whole list; one row per sign' })
    @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => GeneralSignDto) @IsOptional()
    generalSigns?: GeneralSignDto[] | null;

    @ApiProperty({ required: false, description: 'Anything on general examination not in the checklist' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    generalExamNote?: string | null;

    @ApiProperty({ required: false, type: [ExamFindingDto], description: 'Systemic examination: every item examined, normal or abnormal; the whole list' })
    @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ExamFindingDto) @IsOptional()
    examFindings?: ExamFindingDto[] | null;

    @ApiProperty({ required: false, type: [SystemNoteDto], description: 'Systemic examination: a note per body system; the whole list' })
    @IsArray() @ArrayMaxSize(16) @ValidateNested({ each: true }) @Type(() => SystemNoteDto) @IsOptional()
    examinations?: SystemNoteDto[] | null;

    // assessment, plan and outcome (14 §5–§6)
    @ApiProperty({ required: false })
    @IsString() @MaxLength(NOTE) @IsOptional()
    summary?: string | null;

    @ApiProperty({ required: false, description: 'The reasoning behind the diagnoses' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    impression?: string | null;

    @ApiProperty({ required: false, description: 'Counselling and warning signs, printable for the patient' })
    @IsString() @MaxLength(NOTE) @IsOptional()
    advice?: string | null;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(NOTE) @IsOptional()
    planNotes?: string | null;

    @ApiProperty({ required: false, type: String, format: 'date', description: 'Required with outcome FOLLOW_UP. Not in the past' })
    @Type(() => Date) @IsDate() @IsOptional()
    followUpOn?: Date | null;

    @ApiProperty({ required: false, enum: ConsultationOutcome })
    @IsEnum(ConsultationOutcome) @IsOptional()
    outcome?: ConsultationOutcome | null;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(NOTE) @IsOptional()
    outcomeNote?: string | null;
}

// ── Diagnoses (14 §5) ────────────────────────────────────────────────────────

export class AddDiagnosisDto {
    @ApiProperty({ example: 'B54', description: 'An active code from GET /diagnosis-codes' })
    @IsString() @IsNotEmpty() @MaxLength(20)
    code!: string;

    @ApiProperty({ enum: DiagnosisCodeSystem, required: false, default: DiagnosisCodeSystem.ICD_10 })
    @IsEnum(DiagnosisCodeSystem) @IsOptional()
    codeSystem?: DiagnosisCodeSystem;

    @ApiProperty({ enum: DiagnosisCertainty })
    @IsEnum(DiagnosisCertainty)
    certainty!: DiagnosisCertainty;

    @ApiProperty({ required: false, default: false, description: 'The working diagnosis; one per consultation. Not a differential, ruled out or reported' })
    @IsBoolean() @IsOptional()
    isPrimary?: boolean;

    @ApiProperty({ required: false, default: false, description: 'Diagnosed elsewhere, from the history; provisional or confirmed only' })
    @IsBoolean() @IsOptional()
    reported?: boolean;

    @ApiProperty({ required: false })
    @IsString() @MaxLength(SHORT) @IsOptional()
    note?: string;
}

/** Changes a diagnosis in a draft. To change the code, remove it and add the right one. */
export class UpdateDiagnosisDto extends PickType(AddDiagnosisDto, ['note'] as const) {
    @ApiProperty({ enum: DiagnosisCertainty, required: false })
    @IsEnum(DiagnosisCertainty) @IsOptional()
    certainty?: DiagnosisCertainty;

    @ApiProperty({ required: false })
    @IsBoolean() @IsOptional()
    isPrimary?: boolean;

    @ApiProperty({ required: false })
    @IsBoolean() @IsOptional()
    reported?: boolean;
}

// ── Addenda (14 §7) ──────────────────────────────────────────────────────────

export class AddAddendumDto {
    @ApiProperty({ example: 'Malaria RDT positive; diagnosis confirmed' })
    @IsString() @IsNotEmpty() @MaxLength(NOTE)
    text!: string;
}

// ── Lists (14 §9) ────────────────────────────────────────────────────────────

class Page {
    @ApiProperty({ required: false, default: 20 })
    @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional()
    limit: number = 20;

    @ApiProperty({ required: false, default: 0 })
    @Type(() => Number) @IsInt() @Min(0) @IsOptional()
    offset: number = 0;
}

export class ConsultationListQueryDto extends Page {
    @ApiProperty({ required: false, enum: ConsultationStatus })
    @IsEnum(ConsultationStatus) @IsOptional()
    status?: ConsultationStatus;

    @ApiProperty({ required: false, enum: ConsultationKind })
    @IsEnum(ConsultationKind) @IsOptional()
    type?: ConsultationKind;

    @ApiProperty({ required: false, description: 'Written by this doctor (user id)' })
    @IsUUID() @IsOptional()
    doctorId?: string;

    @ApiProperty({ required: false })
    @IsUUID() @IsOptional()
    clinicId?: string;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'Started from (inclusive)' })
    @Type(() => Date) @IsDate() @IsOptional()
    from?: Date;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'Started up to (inclusive)' })
    @Type(() => Date) @IsDate() @IsOptional()
    to?: Date;

    @ApiProperty({ required: false, description: 'Words in the complaints, or a diagnosis code or description' })
    @IsString() @MaxLength(100) @IsOptional()
    search?: string;
}

export class PatientDiagnosisQueryDto extends Page {
    @ApiProperty({ required: false, enum: DiagnosisCertainty, description: "Each condition's latest certainty" })
    @IsEnum(DiagnosisCertainty) @IsOptional()
    certainty?: DiagnosisCertainty;

    @ApiProperty({ required: false, description: 'Only conditions diagnosed elsewhere (true) or here (false)' })
    @Transform(bool) @IsBoolean() @IsOptional()
    reported?: boolean;

    @ApiProperty({ required: false, description: 'A code or words in the description' })
    @IsString() @MaxLength(100) @IsOptional()
    search?: string;
}

/** For the review-of-systems and examination lists. */
export class ClinicalListQueryDto {
    @ApiProperty({ required: false, description: "Leave out what doesn't apply to this consultation's patient" })
    @IsUUID() @IsOptional()
    consultationId?: string;
}

// a three-character ICD-10 code: a letter and two digits ("A00")
const CATEGORY = /^[A-Z]\d{2}$/;
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class DiagnosisChapterQueryDto {
    @ApiProperty({ required: false, enum: DiagnosisCodeSystem, default: DiagnosisCodeSystem.ICD_10 })
    @IsEnum(DiagnosisCodeSystem) @IsOptional()
    codeSystem: DiagnosisCodeSystem = DiagnosisCodeSystem.ICD_10;
}

export class DiagnosisGroupQueryDto extends Page {
    @ApiProperty({ required: false, enum: DiagnosisCodeSystem, default: DiagnosisCodeSystem.ICD_10 })
    @IsEnum(DiagnosisCodeSystem) @IsOptional()
    codeSystem: DiagnosisCodeSystem = DiagnosisCodeSystem.ICD_10;

    @ApiProperty({ required: false, example: '01', description: "A chapter's number, from GET /diagnosis-codes/chapters" })
    @Matches(/^\d{2}$/) @IsOptional()
    chapter?: string;

    @ApiProperty({ required: false, example: 'tuberculosis', description: 'Words in the title' })
    @IsString() @MaxLength(100) @IsOptional()
    search?: string;
}

export class DiagnosisCodeQueryDto extends Page {
    @ApiProperty({ required: false, example: 'malaria', description: 'A code ("B54") or words in the title' })
    @IsString() @MaxLength(100) @IsOptional()
    search?: string;

    @ApiProperty({ required: false, enum: DiagnosisCodeSystem, default: DiagnosisCodeSystem.ICD_10 })
    @IsEnum(DiagnosisCodeSystem) @IsOptional()
    codeSystem: DiagnosisCodeSystem = DiagnosisCodeSystem.ICD_10;

    @ApiProperty({ required: false, example: '01', description: "Only the chapter's codes (its number)" })
    @Matches(/^\d{2}$/) @IsOptional()
    chapter?: string;

    @ApiProperty({ required: false, example: 'A15', description: "Only the group's codes (its first code, from GET /diagnosis-codes/groups)" })
    @Transform(upper) @Matches(CATEGORY, { message: 'group must be a three-character code, e.g. A15' }) @IsOptional()
    group?: string;

    @ApiProperty({ required: false, example: 'A00', description: 'Codes from this three-character code (inclusive)' })
    @Transform(upper) @Matches(CATEGORY, { message: 'from must be a three-character code, e.g. A00' }) @IsOptional()
    from?: string;

    @ApiProperty({ required: false, example: 'A09', description: "Codes up to this three-character code, with its subdivisions (A09.9). Defaults to from" })
    @Transform(upper) @Matches(CATEGORY, { message: 'to must be a three-character code, e.g. A09' }) @IsOptional()
    to?: string;
}
