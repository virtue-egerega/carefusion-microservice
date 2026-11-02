import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength,
    ValidateNested,
} from 'class-validator';
import { CatalogStatus } from '@shared/enums/billables/billables.enums';
import {
    BatchQuality, MedicineBodySystem, DosageForm, LegalCategory, MedicineRoute, PharmacyUnitType, ReceiptType, StockStatus, StorageCondition,
} from '@shared/enums/inventory/inventory.enums';

// ── Medicines (PRD 15 §3.1) ──────────────────────────────────────────────────

export class CreateMedicineDto {
    @ApiProperty({ example: 'Paracetamol', description: 'Without strength or form, which have their own fields. Combinations: "Artemether + Lumefantrine"' })
    @IsString() @MinLength(2)
    genericName!: string;

    @ApiProperty({ required: false, example: '500 mg', description: 'Display text: "500 mg", "250 mg/5 ml". Leave out for medicines with none (medical gases)' })
    @IsString() @MinLength(1) @IsOptional()
    strength?: string;

    @ApiProperty({ enum: DosageForm, example: DosageForm.TABLET })
    @IsEnum(DosageForm)
    dosageForm!: DosageForm;

    @ApiProperty({ enum: MedicineRoute, example: MedicineRoute.ORAL })
    @IsEnum(MedicineRoute)
    route!: MedicineRoute;

    @ApiProperty({ required: false, example: 'Tablet', description: '"Vial", "Ampoule", "20 mL bottle"' })
    @IsString() @IsOptional()
    presentation?: string;

    @ApiProperty({ type: [String], required: false, example: ['Paracetamol'], description: 'Defaults to the generic name' })
    @IsArray() @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @IsOptional()
    ingredients?: string[];

    @ApiProperty({ type: [String], required: false, example: ['Acetaminophen', 'PCM'], description: 'Other names staff search by' })
    @IsArray() @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @IsOptional()
    aliases?: string[];

    @ApiProperty({ type: [String], required: false, example: ['PAIN', 'FEVER'], description: 'Codes from GET /pharmacy/therapeutic-uses' })
    @IsArray() @ArrayUnique() @IsString({ each: true }) @IsOptional()
    therapeuticUses?: string[];

    @ApiProperty({ enum: MedicineBodySystem, isArray: true, required: false })
    @IsArray() @ArrayUnique() @IsEnum(MedicineBodySystem, { each: true }) @IsOptional()
    bodySystems?: MedicineBodySystem[];

    @ApiProperty({ enum: LegalCategory, required: false, default: LegalCategory.POM })
    @IsEnum(LegalCategory) @IsOptional()
    legalCategory?: LegalCategory;

    @ApiProperty({ required: false, description: 'Leave out when not known' })
    @IsBoolean() @IsOptional()
    controlled?: boolean;

    @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;
}

export class UpdateMedicineDto extends PartialType(CreateMedicineDto) {
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

// ── Pharmacy units (PRD 15 §7) ───────────────────────────────────────────────

export class CreatePharmacyUnitDto {
    @ApiProperty({ required: false, description: "Defaults to the caller's branch" })
    @IsUUID() @IsOptional()
    branchId?: string;

    @ApiProperty({ example: 'OPD-DISP', description: 'Unique in the organisation' })
    @IsString() @MinLength(1)
    code!: string;

    @ApiProperty({ example: 'OPD Dispensary' })
    @IsString() @MinLength(2)
    name!: string;

    @ApiProperty({ enum: PharmacyUnitType, example: PharmacyUnitType.DISPENSARY, description: 'STORE receives deliveries; a DISPENSARY serves patients' })
    @IsEnum(PharmacyUnitType)
    type!: PharmacyUnitType;
}

export class UpdatePharmacyUnitDto {
    @ApiProperty({ required: false }) @IsString() @MinLength(1) @IsOptional() code?: string;
    @ApiProperty({ required: false }) @IsString() @MinLength(2) @IsOptional() name?: string;
    @ApiProperty({ enum: PharmacyUnitType, required: false }) @IsEnum(PharmacyUnitType) @IsOptional() type?: PharmacyUnitType;

    @ApiProperty({ enum: CatalogStatus, required: false, description: 'INACTIVE only while the unit holds no stock' })
    @IsEnum(CatalogStatus) @IsOptional()
    status?: CatalogStatus;
}

// ── Stocked products (PRD 15 §3.2–§4) ────────────────────────────────────────

export class NewCategoryDto {
    @ApiProperty({ example: 'Antibiotics', description: "Matched to the hospital's categories ignoring case and spacing, else created" })
    @IsString() @MinLength(2)
    name!: string;
}

/** What `PUT /pharmacy/items/:itemId` sets on an existing catalogue item. Fields left out keep their value. */
export class StockItemDto {
    @ApiProperty({ required: false, description: 'Required for PHARMACY items; a seeded medicine or one of the hospitals own. Its strength is the products' })
    @IsUUID() @IsOptional()
    medicineId?: string;

    @ApiProperty({ required: false, example: 'Emzor Paracetamol' }) @IsString() @IsOptional() brandName?: string;
    @ApiProperty({ required: false }) @IsUUID() @IsOptional() manufacturerId?: string;
    @ApiProperty({ required: false, description: 'NAFDAC registration number' }) @IsString() @IsOptional() registrationNo?: string;
    @ApiProperty({ required: false, example: 'B3', description: 'Where it sits in the pharmacy, if shelves are labelled' }) @IsString() @IsOptional() shelfNumber?: string;

    @ApiProperty({ required: false, example: 'Carton', description: 'What it is bought in. Required when first stocked; fixed once it has stock' })
    @IsString() @MinLength(1) @IsOptional()
    purchaseUnitName?: string;

    @ApiProperty({ required: false, example: 24, description: 'Selling units in one purchase unit. Required when first stocked; fixed once it has stock' })
    @IsInt() @Min(1) @IsOptional()
    sellingUnitsPerPurchaseUnit?: number;

    @ApiProperty({ required: false, default: false, description: 'Half a selling unit (half a card) may be issued. Fixed once it has stock' })
    @IsBoolean() @IsOptional()
    sellableInHalves?: boolean;

    @ApiProperty({ required: false, default: true, description: 'Batch number and expiry required on receipt' })
    @IsBoolean() @IsOptional()
    batchTracked?: boolean;

    @ApiProperty({ required: false, default: false, description: 'Receipt items default to QUARANTINE' })
    @IsBoolean() @IsOptional()
    quarantineOnReceipt?: boolean;

    @ApiProperty({ enum: StorageCondition, required: false, default: StorageCondition.ROOM_TEMPERATURE })
    @IsEnum(StorageCondition) @IsOptional()
    storageCondition?: StorageCondition;
}

/** `POST /pharmacy/items`: the billable item and its stock settings in one write (§3.3). */
export class CreateStockedProductDto {
    @ApiProperty({ required: false, description: 'One of the hospitals categories; or give `category` instead' })
    @IsUUID() @IsOptional()
    categoryId?: string;

    @ApiProperty({ type: NewCategoryDto, required: false, description: 'Found by name (any case or spacing), or created: PHARMACY kind with a medicine, else CONSUMABLE' })
    @ValidateNested() @Type(() => NewCategoryDto) @IsOptional()
    category?: NewCategoryDto;

    @ApiProperty({ example: 'DRG-AMX125-24', description: "The hospital's own code; unique in the organisation" })
    @IsString() @MinLength(1)
    code!: string;

    @ApiProperty({ example: 'Amoxil 125mg/5ml Suspension, carton of 24' })
    @IsString() @MinLength(2)
    name!: string;

    @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;

    @ApiProperty({ example: 'bottle', description: 'What one quantity sold means: bottle, card, vial. Stock is counted in it' })
    @IsString() @MinLength(1)
    sellingUnit!: string;

    @ApiProperty({ 
        required: false, 
        description: 'Required for a drug: a seeded medicine or one of the hospitals own' 
    })
    @IsUUID() 
    @IsOptional()
    medicineId?: string;

    @ApiProperty({ required: false, example: 'Amoxil' }) @IsString() @IsOptional() brandName?: string;

    @ApiProperty({ required: false, description: 'One of the hospitals manufacturers; or give `manufacturer` instead' })
    @IsUUID() @IsOptional()
    manufacturerId?: string;

    @ApiProperty({ type: CreateManufacturerDto, required: false, description: 'Found by name (any case or spacing), or created' })
    @ValidateNested() @Type(() => CreateManufacturerDto) @IsOptional()
    manufacturer?: CreateManufacturerDto;

    @ApiProperty({ required: false, description: 'NAFDAC registration number' }) @IsString() @IsOptional() registrationNo?: string;
    @ApiProperty({ required: false, example: 'B3' }) @IsString() @IsOptional() shelfNumber?: string;

    @ApiProperty({ example: 'Carton', description: 'What it is bought in' })
    @IsString() @MinLength(1)
    purchaseUnitName!: string;

    @ApiProperty({ example: 24, description: 'Selling units in one purchase unit' })
    @IsInt() @Min(1)
    sellingUnitsPerPurchaseUnit!: number;

    @ApiProperty({ required: false, default: false }) @IsBoolean() @IsOptional() sellableInHalves?: boolean;
    @ApiProperty({ required: false, default: true }) @IsBoolean() @IsOptional() batchTracked?: boolean;
    @ApiProperty({ required: false, default: false }) @IsBoolean() @IsOptional() quarantineOnReceipt?: boolean;

    @ApiProperty({ enum: StorageCondition, required: false, default: StorageCondition.ROOM_TEMPERATURE })
    @IsEnum(StorageCondition) @IsOptional()
    storageCondition?: StorageCondition;

    @ApiProperty({ required: false, example: 2500, description: 'First self-pay price of one selling unit (MANUAL); needs billable.price.create' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional()
    sellingUnitPrice?: number;

    @ApiProperty({ required: false, example: 'Launch price', description: 'Required with sellingUnitPrice' })
    @IsString() @MinLength(3) @IsOptional()
    reason?: string;
}

// ── Goods receipts (PRD 15 §10) ──────────────────────────────────────────────

export class NewSupplierDto {
    @ApiProperty({ example: 'Alpha Pharma Distributors Ltd', description: "Matched to the hospital's suppliers ignoring case and spacing, else created" })
    @IsString() @MinLength(2)
    name!: string;

    @ApiProperty({ type: [String], required: false, example: ['08031234567'] })
    @IsArray() @ArrayUnique() @IsString({ each: true }) @IsOptional()
    phone?: string[];

    @ApiProperty({ required: false }) @IsEmail() @IsOptional() email?: string;
}

/** The delivery as it arrived: the invoice header. Items are added one by one. */
export class CreateGoodsReceiptDto {
    @ApiProperty({ enum: ReceiptType, required: false, default: ReceiptType.DELIVERY, description: 'OPENING: stock at go-live, no supplier' })
    @IsEnum(ReceiptType) @IsOptional()
    type?: ReceiptType;

    @ApiProperty({ required: false, description: 'DELIVERY: one of the hospital\'s suppliers; or give `supplier` instead' })
    @IsUUID() @IsOptional()
    supplierId?: string;

    @ApiProperty({ type: NewSupplierDto, required: false, description: 'DELIVERY: picked by name or created' })
    @ValidateNested() @Type(() => NewSupplierDto) @IsOptional()
    supplier?: NewSupplierDto;

    @ApiProperty({ required: false, description: "The pharmacy unit it's received into. Defaults to your branch's store" })
    @IsUUID() @IsOptional()
    pharmacyUnitId?: string;

    @ApiProperty({ required: false, example: 'INV-5531' }) 
    @IsString() 
    @IsOptional() 
    supplierInvoiceNo?: string;

    @ApiProperty({ required: false, example: '2026-11-02' })
    @IsDateString({ strict: true }) @IsOptional()
    supplierInvoiceDate?: string;

    @ApiProperty({ required: false, example: 2526400, description: `The invoice's total as printed (naira, 2 dp); checked against the items` })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsNotEmpty()
    supplierInvoiceTotal!: number;

    @ApiProperty({ required: false }) 
    @IsString() 
    @IsOptional() 
    deliveryNote?: string;

    @ApiProperty({ example: '2026-11-02T10:00:00Z', description: 'When the goods physically arrived' })
    @IsDateString()
    receivedAt!: string;

    @ApiProperty({ required: false }) 
    @IsString() 
    @IsOptional() 
    notes?: string;

    @ApiProperty({ type: [String], required: false, description: 'Invoice photos or scans: ids from POST /files. One or more' })
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(10)
    @IsUUID('all', { each: true })
    @IsOptional()
    attachmentFileIds?: string[];
}

export class UpdateGoodsReceiptDto {
    @ApiProperty({ required: false }) @IsUUID() @IsOptional() supplierId?: string;
    @ApiProperty({ type: NewSupplierDto, required: false }) @ValidateNested() @Type(() => NewSupplierDto) @IsOptional() supplier?: NewSupplierDto;
    @ApiProperty({ required: false }) @IsUUID() @IsOptional() pharmacyUnitId?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() supplierInvoiceNo?: string;
    @ApiProperty({ required: false }) @IsDateString({ strict: true }) @IsOptional() supplierInvoiceDate?: string;
    @ApiProperty({ required: false }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @IsOptional() supplierInvoiceTotal?: number;
    @ApiProperty({ required: false }) @IsString() @IsOptional() deliveryNote?: string;
    @ApiProperty({ required: false }) @IsDateString() @IsOptional() receivedAt?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() notes?: string;
}

/**
 * One product on the delivery: an existing stocked product picked by `stockItemId`, or a new one created on the
 * spot from `newProduct` (§10.2). Its purchase unit and selling units per purchase unit come from the product.
 */
export class GoodsReceiptItemDto {
    @ApiProperty({ required: false, description: 'An existing stocked product; or give `newProduct` instead' })
    @IsUUID() @IsOptional()
    stockItemId?: string;

    @ApiProperty({ type: CreateStockedProductDto, required: false, description: 'A product not on the system yet: created with the item' })
    @ValidateNested() @Type(() => CreateStockedProductDto) @IsOptional()
    newProduct?: CreateStockedProductDto;

    @ApiProperty({ example: 50 }) @IsInt() @Min(0) purchaseUnitsDelivered!: number;
    @ApiProperty({ example: 50, description: 'Only accepted purchase units enter stock' }) @IsInt() @Min(0) purchaseUnitsAccepted!: number;
    @ApiProperty({ required: false, example: '1 carton crushed', description: 'Required when fewer were accepted than delivered' }) @IsString() @IsOptional() rejectReason?: string;

    @ApiProperty({ example: 50000, description: 'Cost of one purchase unit, as invoiced (naira, 2 dp)' })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
    purchaseUnitCost!: number;

    @ApiProperty({ required: false, example: 'A123', description: 'Required for batch-tracked products, by posting' }) @IsString() @MinLength(1) @IsOptional() batchNumber?: string;
    @ApiProperty({ required: false, example: '2027-06-30', description: 'Required for batch-tracked products. EXP 06/2027 is the last day of the month' })
    @IsDateString({ strict: true }) @IsOptional()
    expiryDate?: string;
    @ApiProperty({ required: false }) @IsDateString({ strict: true }) @IsOptional() manufacturedOn?: string;

    @ApiProperty({ required: false, description: "Put away in this pharmacy unit instead of the receipt's (same branch)" }) @IsUUID() @IsOptional() putAwayPharmacyUnitId?: string;

    @ApiProperty({ enum: [StockStatus.AVAILABLE, StockStatus.QUARANTINE], required: false, description: "Defaults from the product's quarantineOnReceipt" })
    @IsIn([StockStatus.AVAILABLE, StockStatus.QUARANTINE]) @IsOptional()
    receiveAs?: StockStatus.AVAILABLE | StockStatus.QUARANTINE;

    @ApiProperty({ required: false, default: true, description: "Roll the product's cost price forward on posting" }) @IsBoolean() @IsOptional() updateCost?: boolean;
    @ApiProperty({ required: false, description: 'Required when updateCost is false' }) @IsString() @IsOptional() keepCostReason?: string;
}

/** A draft item's fields; a different product is picked by `stockItemId` (create a new one by adding an item). */
export class UpdateGoodsReceiptItemDto extends PartialType(OmitType(GoodsReceiptItemDto, ['newProduct'] as const)) {}

export class CancelGoodsReceiptDto {
    @ApiProperty({ example: 'Entered twice' }) @IsString() @MinLength(3) reason!: string;
}

export class AttachGoodsReceiptFilesDto {
    @ApiProperty({ type: [String], description: 'Ids from POST /files. One or more' })
    @IsArray() @ArrayNotEmpty() @ArrayUnique() @ArrayMaxSize(10) @IsUUID('all', { each: true })
    attachmentFileIds!: string[];

    @ApiProperty({ required: false, example: 'Invoice page 2' }) @IsString() @IsOptional() description?: string;
}

// ── Stock status and batch quality (PRD 15 §8.3, §14.3) ──────────────────────

export class StatusChangeLineDto {
    @ApiProperty({ description: 'The batch whose stock changes status' }) @IsUUID() batchId!: string;
    @ApiProperty({ enum: StockStatus }) @IsEnum(StockStatus) from!: StockStatus;
    @ApiProperty({ enum: StockStatus }) @IsEnum(StockStatus) to!: StockStatus;

    @ApiProperty({ example: 24, description: 'Selling units: whole, or a half where the product allows it' })
    @IsNumber({ maxDecimalPlaces: 1 })
    sellingUnitQuantity!: number;
}

export class StatusChangeDto {
    @ApiProperty({ description: 'The pharmacy unit the stock is in' })
    @IsUUID()
    pharmacyUnitId!: string;

    @ApiProperty({ type: [StatusChangeLineDto] })
    @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => StatusChangeLineDto)
    lines!: StatusChangeLineDto[];

    @ApiProperty({ example: 'Inspected: seals intact' }) @IsString() @MinLength(3) reason!: string;
}

export class BatchQualityDto {
    @ApiProperty({ enum: BatchQuality, description: 'RELEASED ↔ ON_HOLD, or RECALLED (final)' })
    @IsEnum(BatchQuality)
    qualityStatus!: BatchQuality;

    @ApiProperty({ example: 'Supplier reported discolouration' }) @IsString() @MinLength(3) reason!: string;
    @ApiProperty({ required: false, example: 'NAFDAC/RC/2026/14', description: 'Required for RECALLED' }) @IsString() @IsOptional() recallReference?: string;
}
