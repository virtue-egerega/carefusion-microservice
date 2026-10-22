import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EncounterStatus, EncounterType, VisitType } from '@shared/enums/encounters/encounter.enums';

// Accepts ?x=A&x=B as well as ?x=A,B
const list = ({ value }: { value: unknown }) =>
    (Array.isArray(value) ? value : String(value).split(',')).map(v => String(v).trim()).filter(Boolean);

/** Filters and search for an encounter list (11 §19). */
export class EncounterListQueryDto {
    @ApiProperty({ required: false, enum: EncounterStatus, isArray: true, description: 'Repeat or comma-separate (status=OPEN,CLOSED)' })
    @Transform(list)
    @IsEnum(EncounterStatus, { each: true })
    @IsOptional()
    status?: EncounterStatus[];

    @ApiProperty({ required: false, enum: EncounterType })
    @IsEnum(EncounterType)
    @IsOptional()
    encounterType?: EncounterType;

    @ApiProperty({ required: false, enum: VisitType, isArray: true, description: 'How the patient came: repeat or comma-separate' })
    @Transform(list)
    @IsEnum(VisitType, { each: true })
    @IsOptional()
    visitType?: VisitType[];

    @ApiProperty({ required: false, description: 'Only encounters at this clinic' })
    @IsUUID()
    @IsOptional()
    clinicId?: string;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'Arrived from (inclusive)' })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    from?: Date;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'Arrived up to (inclusive)' })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    to?: Date;

    @ApiProperty({ required: false, description: 'An encounter code (ENC-26-00481, any case, padding optional) or words in the reason for visit' })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    search?: string;

    @ApiProperty({ required: false, default: 20 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    limit: number = 20;

    @ApiProperty({ required: false, default: 0 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    offset: number = 0;
}
