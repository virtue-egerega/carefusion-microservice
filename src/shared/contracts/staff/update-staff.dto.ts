import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { HospitalStaffRole, UserStatus } from '@shared/enums/users/user.enums';

export class UpdateStaffDto {
    @ApiProperty({ example: 'John', required: false })
    @IsString()
    @IsOptional()
    @MinLength(2)
    firstName?: string;

    @ApiProperty({ example: 'Paul', required: false })
    @IsString()
    @IsOptional()
    middleName?: string;

    @ApiProperty({ example: 'Doe', required: false })
    @IsString()
    @IsOptional()
    @MinLength(2)
    lastName?: string;

    @ApiProperty({ example: ['+2348012345678'], type: [String], required: false })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    phone?: string[];

    @ApiProperty({ enum: HospitalStaffRole, required: false })
    @IsEnum(HospitalStaffRole)
    @IsOptional()
    role?: HospitalStaffRole;

    @ApiProperty({ enum: UserStatus, required: false })
    @IsEnum(UserStatus)
    @IsOptional()
    status?: UserStatus;

    @ApiProperty({ required: false })
    @IsUUID()
    @IsOptional()
    departmentId?: string;

    @ApiProperty({ required: false })
    @IsUUID()
    @IsOptional()
    updatedBy?: string;
}
