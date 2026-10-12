import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { HospitalStaffRole } from '@shared/enums/users/user.enums';

export class CreateDutyProfileDto {
    @ApiProperty({ example: 'Gyno Nurse' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ enum: HospitalStaffRole, description: 'Staff role this profile is intended for (used as a filter tag)' })
    @IsEnum(HospitalStaffRole)
    @IsNotEmpty()
    role!: HospitalStaffRole;

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
