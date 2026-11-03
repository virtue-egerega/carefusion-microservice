import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsDate, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max,
    Min, MinLength, ValidateNested,
} from 'class-validator';
import { ServiceCategory } from '@shared/enums/billing/billing.enums';
import { CatalogStatus, PriceBasis } from '@shared/enums/billables/billables.enums';

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

// ── Item units (PRD 15 §4.1) ─────────────────────────────────────────────────

export class NewItemUnitDto {
    @ApiProperty({ example: 'Strip', description: `Matched to a seeded or the hospital's own unit by name or plural, any case; else added as the hospital's own` })
    @IsString() @MinLength(1)
    name!: string;
}

export class CreateItemUnitDto {
    @ApiProperty({ example: 'Strip' }) @IsString() @MinLength(1) name!: string;
    @ApiProperty({ required: false, example: 'Strips', description: 'Defaults to the name' }) @IsString() @MinLength(1) @IsOptional() pluralName?: string;

    @ApiProperty({ enum: ServiceCategory, isArray: true, example: [ServiceCategory.PHARMACY], description: 'The kinds of item it belongs to' })
    @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsEnum(ServiceCategory, { each: true })
    kinds!: ServiceCategory[];

    @ApiProperty({ description: 'Offered as a selling unit' }) @IsBoolean() usedForSelling!: boolean;
    @ApiProperty({ description: 'Offered as a purchase unit' }) @IsBoolean() usedForPurchase!: boolean;
}

export class UpdateItemUnitDto extends PartialType(CreateItemUnitDto) {
    @ApiProperty({ enum: CatalogStatus, required: false, description: 'INACTIVE: no longer offered; items already using it keep it' })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}

// ── Billable items (PRD 12 §4) ───────────────────────────────────────────────

export class CostPriceDto {
    @ApiProperty({ example: 50000, description: 'What one purchase unit (the carton, box) cost, as invoiced (naira, 2 dp)' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
    purchaseUnitCost!: number;

    @ApiProperty({ example: 24, default: 1, description: 'How many selling units are in that purchase unit' })
    @IsInt() @Min(1) @IsOptional()
    sellingUnitsPerPurchaseUnit?: number;

    @ApiProperty({ required: false, example: 'INV-20431', description: 'Supplier invoice number, market survey…' })
    @IsString() @IsOptional()
    source?: string;
}

export class SelfPayPriceDto {
    @ApiProperty({
        enum: [PriceBasis.MANUAL, PriceBasis.MARKUP],
        description: 'MANUAL: a fixed `sellingUnitPrice`. MARKUP: `percent` on top of `cost` (needs billable.cost.create)',
    })
    @IsIn([PriceBasis.MANUAL, PriceBasis.MARKUP])
    basis!: PriceBasis.MANUAL | PriceBasis.MARKUP;

    @ApiProperty({ required: false, example: 4500, description: 'MANUAL only: the price of one selling unit' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
    sellingUnitPrice?: number;

    @ApiProperty({ required: false, example: 30, description: 'MARKUP only: percent on top of cost' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999.99) @IsOptional()
    percent?: number;

    @ApiProperty({ type: CostPriceDto, required: false, description: "MARKUP only: the item's first cost price" })
    @ValidateNested() 
    @Type(() => CostPriceDto) 
    @IsOptional()
    cost?: CostPriceDto;
}

export class CreateBillableItemDto {
    @ApiProperty() 
    @IsUUID() 
    categoryId!: string;

    @ApiProperty({ example: 'LAB-FBC', description: "The hospital's own code; unique in the organisation" })
    @IsString() 
    @MinLength(1) 
    code!: string;

    @ApiProperty({ example: 'Full Blood Count' }) 
    @IsString() 
    @MinLength(2) 
    name!: string;

    @ApiProperty({ required: false }) 
    @IsString() 
    @IsOptional() 
    description?: string;
    
    @ApiProperty({ required: false, description: 'What one quantity sold is: an item unit (GET /billables/item-units?use=SELLING&kind=…); or give `sellingUnit`' })
    @IsUUID()
    @IsOptional()
    sellingUnitId?: string;

    @ApiProperty({ type: NewItemUnitDto, required: false, description: 'A unit typed by name: found, or added as the hospitals own' })
    @ValidateNested()
    @Type(() => NewItemUnitDto)
    @IsOptional()
    sellingUnit?: NewItemUnitDto;

    @ApiProperty({ type: SelfPayPriceDto, description: 'The self-pay price, effective immediately (PRD 12 §4.2)' })
    @ValidateNested() @Type(() => SelfPayPriceDto)
    selfPay!: SelfPayPriceDto;

    @ApiProperty({ example: 'New service', description: 'Why this price; recorded on the price line (and cost)' })
    @IsString() @MinLength(3)
    reason!: string;

    @ApiProperty({ type: [String], required: false, description: 'Clinics this item is used at (PRD 12 §4.4)' })
    @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) @IsOptional()
    clinicIds?: string[];
}

export class UpdateBillableItemDto {
    @ApiProperty({ required: false, description: 'Move to another category of the same kind' }) @IsUUID() @IsOptional() categoryId?: string;
    @ApiProperty({ required: false }) @IsString() @MinLength(1) @IsOptional() code?: string;
    @ApiProperty({ required: false }) @IsString() @MinLength(2) @IsOptional() name?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;
    @ApiProperty({ required: false, description: "An item unit; locked once the item has stock (PRD 15 §3.4)" }) @IsUUID() @IsOptional() sellingUnitId?: string;

    @ApiProperty({ enum: CatalogStatus, required: false, description: "INACTIVE: can't be priced for new charges; never deleted" })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;

    @ApiProperty({ type: [String], required: false, description: 'Clinics to link; already-linked ones are ignored' })
    @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) @IsOptional()
    addClinicIds?: string[];

    @ApiProperty({ type: [String], required: false, description: 'Clinics to unlink; unlinked ones are ignored' })
    @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) @IsOptional()
    removeClinicIds?: string[];
}

// ── Price lines (PRD 12 §6) ──────────────────────────────────────────────────

export class CreatePriceLineDto {
    @ApiProperty({ required: false, description: 'Omit for the self-pay line' })
    @IsUUID() @IsOptional()
    payerId?: string;

    @ApiProperty({ enum: PriceBasis, description: 'Self-pay: MANUAL or MARKUP. Payer: any' })
    @IsEnum(PriceBasis)
    basis!: PriceBasis;

    @ApiProperty({ required: false, example: 2500, description: 'TARIFF, MANUAL: the price of one selling unit (naira, 2 dp)' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
    sellingUnitPrice?: number;

    @ApiProperty({ required: false, example: 30, description: 'DISCOUNT: off the self-pay price. MARKUP: on top of cost' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999.99) @IsOptional()
    percent?: number;

    @ApiProperty({ required: false, description: 'TARIFF (required): the payer agreement that set it' })
    @IsUUID() @IsOptional()
    agreementId?: string;

    @ApiProperty({ required: false, description: 'Defaults to now; never in the past (no backdating)' })
    @Type(() => Date) @IsDate() @IsOptional()
    effectiveFrom?: Date;

    @ApiProperty({ example: 'Launch price' })
    @IsString() @MinLength(3)
    reason!: string;
}

// ── Quotes (PRD 12 §9.3) ─────────────────────────────────────────────────────

export class QuoteLineDto {
    @ApiProperty() @IsUUID()
    billableItemId!: string;

    @ApiProperty({ example: 1, default: 1, required: false, description: 'Up to 3 decimal places: 2.5 bed-days, 7.5 ml' })
    @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() @IsOptional()
    quantity?: number;
}

export class QuoteDto {
    @ApiProperty({ required: false, description: 'Omit for self-pay, the default payer type' })
    @IsUUID() @IsOptional()
    payerId?: string;

    @ApiProperty({ type: [QuoteLineDto] })
    @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => QuoteLineDto)
    items!: QuoteLineDto[];
}
