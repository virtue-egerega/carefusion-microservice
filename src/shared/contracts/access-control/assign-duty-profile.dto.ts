import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AssignDutyProfileDto {
    @ApiProperty({ description: 'DutyProfile.id to assign' })
    @IsUUID()
    dutyProfileId!: string;

    @ApiProperty({ description: 'ISO date — set for a temporary/acting assignment, omit for permanent', required: false })
    @IsDateString()
    @IsOptional()
    endsAt?: string;
}
