import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, IsArray, MinLength } from 'class-validator';
import { HospitalStaffRole } from '@shared/enums/users/user.enums';

export class CreateStaffDto {
    @ApiProperty({ example: 'john.doe@carefusion.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiProperty({ example: 'John' })
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    firstName!: string;

    @ApiProperty({ example: 'Paul', required: false })
    @IsString()
    @IsOptional()
    middleName?: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    lastName!: string;

    @ApiProperty({ example: ['+2348012345678'], type: [String] })
    @IsArray()
    @IsString({ each: true })
    phone!: string[];

    @ApiProperty({ enum: HospitalStaffRole, example: HospitalStaffRole.NURSE })
    @IsEnum(HospitalStaffRole)
    @IsNotEmpty()
    role!: HospitalStaffRole;

    @ApiProperty({ description: 'Department to assign at creation', required: false })
    @IsUUID()
    @IsOptional()
    departmentId?: string;

    @ApiProperty({
        required: false,
        description: "Home branch: where this staff member works; carried in their login token. Defaults to the creating admin's branch.",
    })
    @IsUUID()
    @IsOptional()
    branchId?: string;

    @ApiProperty({ description: "Duty profile to assign: it decides the staff member's permissions and queues" })
    @IsUUID()
    @IsNotEmpty()
    dutyProfileId!: string;
}
