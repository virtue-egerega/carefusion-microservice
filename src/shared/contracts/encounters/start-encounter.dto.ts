import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class StartEncounterDto {
    @ApiProperty({ description: 'The registered patient (found or just registered)', example: '7d3f2c1a-5b8e-4f60-9a21-3c4d5e6f7a8b' })
    @IsUUID()
    patientId!: string;

    @ApiProperty({ description: 'The clinic the patient came to see ("what kind of doctor are you seeing today?"), from GET /clinics', example: 'c0a8012e-4b1d-4e3a-8f2b-9d7c6e5f4a3b' })
    @IsUUID()
    clinicId!: string;

    @ApiProperty({
        description: "The consultation item staff chose (e.g. one of the clinic's linked items). Must be active with a current price; " +
            'charged at its self-pay price unless the visit is exempt (insured, or continuing at the same clinic).',
        example: '41da8c96-eacb-4bd7-898d-1c37e19df3b8',
    })
    @IsUUID()
    billableItemId!: string;

    @ApiProperty({
        required: false,
        type: [String],
        description: "Where to send the patient now: billing, the clinic's nursing station, or both (queue ids from GET /queues/sendable). Default: the clinic's nursing station.",
        example: ['5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170', '0f1e2d3c-4b5a-4968-8776-655443322110'],
    })
    @IsArray()
    @ArrayMaxSize(5)
    @IsUUID('all', { each: true })
    @IsOptional()
    sendTo?: string[];

    @ApiProperty({
        required: false,
        description: "The coverage this visit uses. Omit to use the patient's highest-priority active coverage. Needs coverage.select.",
    })
    @IsUUID()
    @IsOptional()
    coverageId?: string;

    @ApiProperty({ required: false, description: 'The patient pays for this visit themselves, even if they have coverage. Needs coverage.select.' })
    @IsBoolean()
    @IsOptional()
    selfPay?: boolean;

    @ApiProperty({
        required: false,
        description: "The patient has an unfinished encounter at this branch (starting it returned 409 OPEN_ENCOUNTER) and reception continues it: the clinic's nursing station task is added to that encounter.",
    })
    @IsBoolean()
    @IsOptional()
    continueEncounter?: boolean;
}
