import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import {
    IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength,
} from 'class-validator';
import { PaymentMode } from '@shared/enums/billing/billing.enums';

export class CreateFamilyAccountDto {
    @ApiProperty({ example: 'The Okafor Family' })
    @IsString()
    @MinLength(2)
    name!: string;

    @ApiProperty({ description: 'Guarantor, if a registered patient. They are moved onto the account.', required: false })
    @IsUUID()
    @IsOptional()
    holderPatientId?: string;

    @ApiProperty({ description: 'Guarantor name, when the holder is not a patient', required: false })
    @IsString()
    @IsOptional()
    holderName?: string;

    @ApiProperty({ type: [String], required: false })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    holderPhone?: string[];
}

export class AddAccountMemberDto {
    @ApiProperty({ description: 'Patient to move onto this account (their current membership is closed)' })
    @IsUUID()
    patientId!: string;
}

export class DepositDto {
    @ApiProperty({ example: 20000 })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amount!: number;

    @ApiProperty({ enum: PaymentMode })
    @IsEnum(PaymentMode)
    modeOfPayment!: PaymentMode;

    @ApiProperty({ required: false, description: 'POS slip / transfer reference' })
    @IsString()
    @IsOptional()
    reference?: string;

    @ApiProperty({ required: false, example: 'Ngozi Okafor', description: "Who paid. Defaults to the account holder's name, else the account's name" })
    @IsString() @MaxLength(120)
    @IsOptional()
    paidByName?: string;

    @ApiProperty({ required: false, example: '+2348031234567' })
    @IsString() @MaxLength(20)
    @IsOptional()
    paidByPhone?: string;

    @ApiProperty({ required: false, example: "Mother's deposit for admission", description: 'Narration; defaults to "Deposit"' })
    @IsString() @MaxLength(255)
    @IsOptional()
    narration?: string;
}

export class UpdateBillingAccountDto extends PartialType(
    PickType(CreateFamilyAccountDto, ['name', 'holderName', 'holderPhone'] as const),
) {}
