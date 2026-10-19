import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, IsDateString, MinLength } from 'class-validator';
import { Gender } from '@shared/enums/users/user.enums';

export class CreatePatientDto {
    @ApiProperty({ example: 'Amaka' })
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    firstName!: string;

    @ApiProperty({ example: 'Grace', required: false })
    @IsString()
    @IsOptional()
    middleName?: string;

    @ApiProperty({ example: 'Okafor' })
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    lastName!: string;

    @ApiProperty({ example: ['+2348012345678'], type: [String] })
    @IsArray()
    @IsString({ each: true })
    phone!: string[];

    @ApiProperty({ example: 'amaka@email.com', required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ example: '1990-04-15', required: false })
    @IsDateString()
    @IsOptional()
    dateOfBirth?: string;

    @ApiProperty({ enum: Gender, required: false })
    @IsEnum(Gender)
    @IsOptional()
    sex?: Gender;

    @ApiProperty({
        required: false,
        description: "Join another patient's billing account; an INDIVIDUAL account becomes a FAMILY account " +
            "(confirm with the holder on holderPhone first). Omit to open the patient's own INDIVIDUAL account.",
    })
    @IsUUID()
    @IsOptional()
    billingAccountId?: string;
}
