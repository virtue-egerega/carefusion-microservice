import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CompleteTaskDto {
    @ApiProperty({
        required: false,
        description: "Where the patient goes next (the next station's queue). Omit when they're done here and going nowhere else: if no other station has a task for them, the encounter closes.",
    })
    @IsUUID()
    @IsOptional()
    nextQueueId?: string;

    @ApiProperty({ required: false })
    @IsString()
    @MaxLength(1000)
    @IsOptional()
    note?: string;
}

export class CancelTaskDto {
    @ApiProperty({ example: 'Patient left; reached by phone, not returning' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    reason!: string;

    @ApiProperty({
        required: false,
        description: "The patient left before finishing. If this was their last task, the encounter closes with LEFT_WITHOUT_BEING_SEEN (never seen by a clinician) or LEFT_BEFORE_COMPLETION.",
    })
    @IsBoolean()
    @IsOptional()
    patientLeft?: boolean;
}

export class AddTaskDto {
    @ApiProperty({ description: 'The list to put the patient on: one of your send queues (GET /queues/sendable), e.g. billing' })
    @IsUUID()
    queueId!: string;
}
