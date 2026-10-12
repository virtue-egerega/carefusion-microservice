import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDutyProfileDto {
    @ApiProperty({ example: 'Gyno Nurse' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ description: 'Role.id', example: 'uuid' })
    @IsUUID()
    @IsNotEmpty()
    roleId!: string;

    @ApiProperty({ description: 'Department.id — omit for a global (queue-less) profile', required: false })
    @IsUUID()
    @IsOptional()
    departmentId?: string;

    @ApiProperty({ description: 'Queue ids from the chosen department', type: [String], required: false })
    @IsArray()
    @IsUUID('all', { each: true })
    @IsOptional()
    queueIds?: string[];

    @ApiProperty({ description: 'Permission keys to grant, e.g. ["patient.view","vitals.record"]', type: [String], required: false })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    permissionKeys?: string[];
}
