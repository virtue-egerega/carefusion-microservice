import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsEmail } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Downtown Branch' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'DWTN', description: 'Short unique code for this branch' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: '45 Marina Road' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Lagos State' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({ example: ['+2348012345678'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  phone!: string[];

  @ApiProperty({ example: 'downtown@hospital.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}
