import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEmail, IsNotEmpty, IsEnum, IsDecimal, IsInt, Min, Max } from 'class-validator';
import { BusinessType, OrgType, PaymentPlan } from '@shared/enums/organizations/organization.enums';

export class CreateOrganizationDto {

  @ApiProperty({
    description: 'Name of the organization',
    example: 'St. Mary\'s Hospital',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Address of the organization',
    example: '123 Main Street, City, Country',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({
    description: "Organization logo (file)",
    type: 'string',
    format: 'binary',
    required: false,
  })
  @IsOptional()
  logo?: string;

  @ApiProperty({
    description: 'Organization phone numbers',
    example: ['+1234567890', '+0987654321'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  phone!: string[];

  @ApiProperty({
    description: 'Email of the organization contact',
    example: 'contact@stmaryshospital.com',
  })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'City where the organization is located',
    example: 'New York',
  })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({
    description: 'State where the organization is located',
    example: 'NY',
  })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({
    description: 'Country where the organization is located',
    example: 'USA',
  })
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({
    description: 'Zip code for the organization location',
    example: '10001',
  })
  @IsString()
  @IsNotEmpty()
  zipCode!: string;

  @ApiProperty({
    description: 'Website URL of the organization',
    example: 'http://www.stmaryshospital.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({
    description: 'Slogan of the organization',
    example: 'Your Health, Our Priority',
    required: false,
  })
  @IsOptional()
  @IsString()
  slogan?: string;

  @ApiProperty({
    description: 'pobox of the organization',
    example: 'P.C.BOX 10234',
    required: false,
  })
  @IsOptional()
  @IsString()
  pobox?: string;

  @ApiProperty({
    description: 'nfcCardFee of the organization',
    example: '3000.00',
    required: false,
  })
  @IsNotEmpty()
  @IsDecimal()
  nfcCardFee!: number;

  @ApiProperty({
    description: 'registrationFee of the organization',
    example: '3000.00',
    required: false,
  })
  @IsNotEmpty()
  @IsDecimal()
  registrationFee!: number;

  @ApiProperty({ description: 'NEONATE up to this many days (default 28)', required: false, example: 28 })
  @IsOptional()
  @IsInt()
  @Min(0)
  neonateMaxDays?: number;

  @ApiProperty({ description: 'INFANT below this age in years (default 1)', required: false, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  infantBelowYears?: number;

  @ApiProperty({ description: 'UNDER_FIVE below this age in years (default 5)', required: false, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  underFiveBelowYears?: number;

  @ApiProperty({ description: 'CHILD up to this age, then ADOLESCENT (default 12)', required: false, example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  childMaxYears?: number;

  @ApiPropertyOptional({
    description: 'First patient number. Defaults to 10001. A hospital moving from paper sets it above its existing hospital numbers. Can be raised later, never lowered.',
    example: 1001,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  patientNumberStart?: number;

  @ApiProperty({
    description: 'Last age (years) the hospital treats as paediatric, e.g. 12, 15 or 17. Drives patient age groups.',
    example: 17,
  })
  @IsInt()
  @Min(5)
  @Max(21)
  paediatricMaxAge!: number;

  @ApiProperty({
    description: 'First age (years) the hospital treats as an older adult, e.g. 60 or 65. Drives patient age groups.',
    example: 60,
  })
  @IsInt()
  @Min(40)
  @Max(100)
  geriatricMinAge!: number;

  @ApiProperty({
    description: 'Payment plan for the organization services',
    enum: PaymentPlan,
    example: 'EPIC',
  })
  @IsOptional()
  @IsEnum(PaymentPlan)
  paymentPlan?: PaymentPlan;

  @ApiProperty({
    description: 'Type of business this organization runs',
    enum: BusinessType,
    example: 'HOSPITAL',
    required: false,
    default: 'HOSPITAL',
  })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiProperty({
    description: 'Whether this organization is a single location or a chain',
    enum: OrgType,
    example: 'STANDALONE',
    required: false,
    default: 'STANDALONE',
  })
  @IsOptional()
  @IsEnum(OrgType)
  orgType?: OrgType;

  @ApiProperty({
    description: 'Local-only healthcare network identifier (unenforced, no FK)',
    example: 'evercare-network',
    required: false,
  })
  @IsOptional()
  @IsString()
  healthcareNetworkId?: string;

  @ApiProperty({
    description: 'Human-readable healthcare network name',
    example: 'Evercare',
    required: false,
  })
  @IsOptional()
  @IsString()
  healthcareNetworkName?: string;
}
