import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
    ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MinLength,
} from 'class-validator';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import { DosageForm, DrugRoute, LocationType, StorageCondition } from '@shared/enums/inventory/inventory.enums';

// ── Drugs (PRD 15 §3.1) ──────────────────────────────────────────────────────

export class CreateDrugDto {
    @ApiProperty({ example: 'Paracetamol' })
    @IsString() @MinLength(2)
    genericName!: string;

    @ApiProperty({ required: false, example: '500 mg', description: 'Display text: "500 mg", "250 mg/5 ml"' })
    @IsString() @MinLength(1) @IsOptional()
    strength?: string;

    @ApiProperty({ enum: DosageForm, example: DosageForm.TABLET })
    @IsEnum(DosageForm)
    dosageForm!: DosageForm;

    @ApiProperty({ enum: DrugRoute, example: DrugRoute.ORAL })
    @IsEnum(DrugRoute)
    route!: DrugRoute;

    @ApiProperty({ required: false, default: true })
    @IsBoolean() @IsOptional()
    prescriptionOnly?: boolean;

    @ApiProperty({ required: false, default: false })
    @IsBoolean() @IsOptional()
    controlled?: boolean;
}

export class UpdateDrugDto extends PartialType(CreateDrugDto) {
    @ApiProperty({ enum: CatalogStatus, required: false, description: "INACTIVE: can't be linked to new products" })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}

// ── Manufacturers and suppliers (PRD 15 §5) ──────────────────────────────────

export class CreateManufacturerDto {
    @ApiProperty({ example: 'Emzor Pharmaceutical Industries' })
    @IsString() @MinLength(2)
    name!: string;

    @ApiProperty({ required: false, example: 'Nigeria' })
    @IsString() @IsOptional()
    country?: string;
}

export class UpdateManufacturerDto extends PartialType(CreateManufacturerDto) {
    @ApiProperty({ enum: CatalogStatus, required: false, description: "INACTIVE: can't be set on a product" })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}

export class CreateSupplierDto {
    @ApiProperty({ example: 'Alpha Pharma Distributors Ltd' })
    @IsString() @MinLength(2)
    name!: string;

    @ApiProperty({ required: false }) @IsString() @IsOptional() contactName?: string;

    @ApiProperty({ type: [String], required: false, example: ['08031234567'] })
    @IsArray() @ArrayUnique() @IsString({ each: true }) @IsOptional()
    phone?: string[];

    @ApiProperty({ required: false }) @IsEmail() @IsOptional() email?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
    @ApiProperty({ required: false, description: 'TIN' }) @IsString() @IsOptional() taxId?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
    @ApiProperty({ enum: CatalogStatus, required: false, description: "INACTIVE: can't be used on new receipts" })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}

// ── Storage locations (PRD 15 §7) ────────────────────────────────────────────

export class CreateStorageLocationDto {
    @ApiProperty({ required: false, description: "Defaults to the caller's branch" })
    @IsUUID() @IsOptional()
    branchId?: string;

    @ApiProperty({ example: 'OPD-DISP', description: 'Unique in the organisation' })
    @IsString() @MinLength(1)
    code!: string;

    @ApiProperty({ example: 'OPD Dispensary' })
    @IsString() @MinLength(2)
    name!: string;

    @ApiProperty({ enum: LocationType, example: LocationType.DISPENSARY })
    @IsEnum(LocationType)
    type!: LocationType;

    @ApiProperty({ enum: StorageCondition, required: false, default: StorageCondition.ROOM_TEMPERATURE })
    @IsEnum(StorageCondition) @IsOptional()
    storageCondition?: StorageCondition;
}

export class UpdateStorageLocationDto {
    @ApiProperty({ required: false }) @IsString() @MinLength(1) @IsOptional() code?: string;
    @ApiProperty({ required: false }) @IsString() @MinLength(2) @IsOptional() name?: string;
    @ApiProperty({ enum: LocationType, required: false }) @IsEnum(LocationType) @IsOptional() type?: LocationType;

    @ApiProperty({ enum: StorageCondition, required: false })
    @IsEnum(StorageCondition) @IsOptional()
    storageCondition?: StorageCondition;

    @ApiProperty({ enum: CatalogStatus, required: false, description: 'INACTIVE only while the location holds no stock' })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}

// ── Stocked items and packs (PRD 15 §3.2, §4) ────────────────────────────────

export class StockItemDto {
    @ApiProperty({ required: false, description: 'Required for PHARMACY items; a system drug or one of the hospital\'s own' })
    @IsUUID() @IsOptional()
    drugId?: string;

    @ApiProperty({ required: false, example: 'Emzor Paracetamol' }) @IsString() @IsOptional() brandName?: string;
    @ApiProperty({ required: false }) @IsUUID() @IsOptional() manufacturerId?: string;
    @ApiProperty({ required: false, description: 'NAFDAC registration number' }) @IsString() @IsOptional() registrationNo?: string;

    @ApiProperty({ required: false, default: true, description: 'Batch number and expiry required on receipt' })
    @IsBoolean() @IsOptional()
    batchTracked?: boolean;

    @ApiProperty({ required: false, default: false, description: 'Receipt lines default to QUARANTINE' })
    @IsBoolean() @IsOptional()
    quarantineOnReceipt?: boolean;

    @ApiProperty({ enum: StorageCondition, required: false, default: StorageCondition.ROOM_TEMPERATURE })
    @IsEnum(StorageCondition) @IsOptional()
    storageCondition?: StorageCondition;
}

export class CreateItemPackDto {
    @ApiProperty({ example: 'Box of 100' })
    @IsString() @MinLength(1)
    name!: string;

    @ApiProperty({ example: 100, description: "How many of the item's base unit are in one pack. Can't be edited later" })
    @IsInt() @Min(1)
    unitsPerPack!: number;

    @ApiProperty({ required: false }) @IsString() @MinLength(1) @IsOptional() barcode?: string;

    @ApiProperty({ required: false, default: false, description: 'Pre-selected on receipts; replaces the current default' })
    @IsBoolean() @IsOptional()
    isDefault?: boolean;
}

export class UpdateItemPackDto {
    @ApiProperty({ required: false }) @IsString() @MinLength(1) @IsOptional() name?: string;
    @ApiProperty({ required: false }) @IsString() @MinLength(1) @IsOptional() barcode?: string;
    @ApiProperty({ required: false }) @IsBoolean() @IsOptional() isDefault?: boolean;
    @ApiProperty({ enum: CatalogStatus, required: false }) @IsEnum(CatalogStatus) @IsOptional() status?: CatalogStatus;
}
