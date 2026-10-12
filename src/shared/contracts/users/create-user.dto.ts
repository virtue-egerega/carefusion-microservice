import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEmail, IsUUID, IsDate, IsEnum, IsNotEmpty, IsStrongPassword, MinLength, ValidateIf, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BillingType, TransactionMode, UserStatus, UserType } from '@shared/enums/users/user.enums';

export class CreateRoleDto {
    @ApiProperty({ description: 'Name of the role, e.g., "Doctor", "Nurse"', example: 'Doctor' })
    @IsString()
    name!: string;

    @ApiProperty({ description: 'Description of the role responsibilities', example: 'Responsible for patient care in the hospital.', required: false })
    @IsOptional()
    @IsString()
    description?: string;
}

export class CreateUserDto {
    @ApiProperty({ description: 'User email address', example: 'john.doe@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiProperty({ description: 'User password', example: 'Password123!' })
    @IsOptional()
    @IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
    password?: string;

    @ApiProperty({ description: 'User first name', example: 'John' })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    firstName!: string;

    @ApiProperty({ description: 'User middle name', example: 'Paul', required: false })
    @IsOptional()
    @IsString()
    @MinLength(3)
    middleName?: string;

    @ApiProperty({ description: 'User last name', example: 'Doe' })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    lastName!: string;

    @ApiProperty({ description: 'User phone numbers', example: ['+1234567890'], type: [String] })
    @IsArray()
    @IsString({ each: true })
    phone!: string[];

    @ApiProperty({ description: 'User type', enum: UserType, example: 'DOCTOR' })
    @IsEnum(UserType)
    type!: UserType;

    @ApiProperty({ description: 'User status', enum: UserStatus, example: 'ACTIVE' })
    @IsEnum(UserStatus)
    status!: UserStatus;

    @ApiProperty({ description: 'Date when the user was created', example: '2023-05-20T00:00:00Z', format: 'date-time' })
    @IsDate()
    @Type(() => Date)
    createdAt!: Date;

    @ApiProperty({ description: 'Hospital ID (required for PATIENT or HOSPITAL_STAFF)', example: 'b56e1d2c-6d6f-4d5b-bfed-91b7344561ad', format: 'uuid', required: false })
    @ValidateIf(o => o.type === UserType.PATIENT || o.type === UserType.HOSPITAL_STAFF)
    @IsUUID()
    @IsNotEmpty()
    hospitalId?: string;

    @ApiProperty({ description: 'Insurance scheme ID (required for NHIS_WORKER)', example: 'b56e1d2c-6d6f-4d5b-bfed-91b7344561ad', format: 'uuid', required: false })
    @ValidateIf(o => o.type === UserType.NHIS_WORKER)
    @IsUUID()
    @IsNotEmpty()
    insuranceSchemeId?: string;

    @ApiProperty({ description: 'Card opening deposit amount (PATIENT only)', example: '5000.00', required: false })
    @ValidateIf(o => o.type === UserType.PATIENT)
    @IsNotEmpty()
    @Min(1000.00)
    amount?: number;

    @ApiProperty({ description: 'Patient billing type', example: BillingType.INSURANCE, required: false })
    @ValidateIf(o => o.type === UserType.PATIENT)
    @IsNotEmpty()
    @IsEnum(BillingType)
    billingType?: BillingType;

    @ApiProperty({ description: 'Payment reference', example: '354rgfed', required: false })
    @ValidateIf(o => o.type === UserType.PATIENT)
    @IsString()
    @IsNotEmpty()
    paymentReference?: string;

    @ApiProperty({ description: 'Payment mode', example: 'CARD', required: false })
    @ValidateIf(o => o.type === UserType.PATIENT)
    @IsEnum(TransactionMode)
    @IsNotEmpty()
    modeOfPayment?: TransactionMode;
}
