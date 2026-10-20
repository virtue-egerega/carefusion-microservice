import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';

// ── Billable categories (PRD 12 §3) ──────────────────────────────────────────

export class CreateBillableCategoryDto {
    @ApiProperty({ example: 'Haematology' }) @IsString() @MinLength(2) name!: string;

    @ApiProperty({
        enum: ServiceCategory, example: ServiceCategory.LABORATORY,
        description: "The system meaning plan benefits and reports use. Can't change once the category has items.",
    })
    @IsEnum(ServiceCategory)
    kind!: ServiceCategory;

    @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;
}

export class UpdateBillableCategoryDto extends PartialType(CreateBillableCategoryDto) {
    @ApiProperty({ enum: CatalogStatus, required: false, description: 'INACTIVE hides it from new items; its items can no longer be priced' })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}
