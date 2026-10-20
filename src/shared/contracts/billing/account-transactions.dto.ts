import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AccountEntryType, PaymentMode } from '@shared/enums/billing/billing.enums';

// Accepts ?x=A&x=B as well as ?x=A,B
const list = ({ value }: { value: unknown }) =>
    (Array.isArray(value) ? value : String(value).split(',')).map(v => String(v).trim()).filter(Boolean);

export class AccountTransactionsQueryDto {
    @ApiProperty({ required: false, enum: AccountEntryType, isArray: true, description: 'Only these types: repeat or comma-separate (entryType=DEPOSIT,REFUND)' })
    @Transform(list)
    @IsEnum(AccountEntryType, { each: true })
    @IsOptional()
    entryType?: AccountEntryType[];

    @ApiProperty({ required: false, enum: ['CREDIT', 'DEBIT'], description: 'Money in (CREDIT) or out (DEBIT)' })
    @IsIn(['CREDIT', 'DEBIT'])
    @IsOptional()
    direction?: 'CREDIT' | 'DEBIT';

    @ApiProperty({ required: false, description: "Only this member's transactions (their charges, and payments recorded for them)" })
    @IsUUID()
    @IsOptional()
    patientId?: string;

    @ApiProperty({ required: false, enum: PaymentMode, isArray: true, description: 'Only payments made this way' })
    @Transform(list)
    @IsEnum(PaymentMode, { each: true })
    @IsOptional()
    modeOfPayment?: PaymentMode[];

    @ApiProperty({ required: false, description: 'Only at this branch' })
    @IsUUID()
    @IsOptional()
    branchId?: string;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'From (inclusive)' })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    from?: Date;

    @ApiProperty({ required: false, type: String, format: 'date-time', description: 'To (inclusive)' })
    @Type(() => Date)
    @IsDate()
    @IsOptional()
    to?: Date;

    @ApiProperty({ required: false, description: "Description, payment reference (POS slip, transfer ref), or the patient's name or number" })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    search?: string;

    @ApiProperty({ required: false, default: 20 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    limit: number = 20;

    @ApiProperty({ required: false, default: 0 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    offset: number = 0;
}
