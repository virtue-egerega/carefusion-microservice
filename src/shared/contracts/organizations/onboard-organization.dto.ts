import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsArray, IsEmail, IsOptional, IsStrongPassword, MinLength, ValidateNested } from 'class-validator';
import { CreateOrganizationDto } from './create-organization.dto';

export class OrgAdminDto {
  @ApiProperty({ example: 'admin@hospital.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName!: string;

  @ApiProperty({ example: ['+2348012345678'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  phone!: string[];
}

export class OnboardOrganizationDto {
  @ApiProperty({ type: () => CreateOrganizationDto })
  @ValidateNested()
  @Type(() => CreateOrganizationDto)
  org!: CreateOrganizationDto;

  @ApiProperty({ type: () => OrgAdminDto })
  @ValidateNested()
  @Type(() => OrgAdminDto)
  admin!: OrgAdminDto;

  @ApiProperty({
    example: 'Headquarters',
    description: 'Name of the auto-created main branch. Defaults to "Headquarters".',
    required: false,
  })
  @IsOptional()
  @IsString()
  mainBranchName?: string;
}
