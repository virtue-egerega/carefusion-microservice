import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import {
    ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength,
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

    @ApiProperty({ description: 'Branch where the money was received' })
    @IsUUID()
    @IsNotEmpty()
    branchId!: string;

    @ApiProperty({
        type: [String], required: false,
        description: 'Allocation ids to pay first, in order. Any remainder pays the oldest unpaid bills.',
    })
    @IsArray()
    @ArrayUnique()
    @IsUUID('all', { each: true })
    @IsOptional()
    targetAllocationIds?: string[];
}

export class UpdateBillingAccountDto extends PartialType(
    PickType(CreateFamilyAccountDto, ['name', 'holderName', 'holderPhone'] as const),
) {}
