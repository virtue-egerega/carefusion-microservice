import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateDutyProfileDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ description: 'Change or clear the linked department', required: false })
    @IsUUID()
    @IsOptional()
    departmentId?: string;
}
