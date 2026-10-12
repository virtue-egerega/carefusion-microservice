import { ApiProperty } from "@nestjs/swagger";
import { CreateRoleDto, CreateUserDto } from "./create-user.dto";
import { IsOptional, IsUUID, IsString, IsDateString, IsEnum, IsNotEmpty, IsStrongPassword, Length } from "class-validator";
import { BillingType, BLOOD_GROUP, Gender, GENOTYPE, HospitalStaffRole, MaritalStatus } from "@shared/enums/users/user.enums";

export class UpdateRoleDto extends CreateRoleDto {
    @ApiProperty({ type: 'string', required: false, example: 'b56e1d2c-6d6f-4d5b-bfed-91b7344561ad', format: 'uuid', })
    @IsOptional()
    @IsUUID()
    updatedBy?: string;

    @ApiProperty({ type: 'string', required: false, example: 'b56e1d2c-6d6f-4d5b-bfed-91b7344561ad', format: 'uuid', })
    @IsOptional()
    @IsUUID()
    deletedBy?: string;
}

export class UpdateUserDto extends CreateUserDto {
    @ApiProperty({
        type: String,
        description: 'User ID of the person updating the resource',
        example: 'user-1234',
        required: false,
      })
      @IsOptional()
      @IsUUID()
      updatedBy?: string;

      @ApiProperty({
        type: String,
        description: 'User ID of the person who deleted the resource',
        example: 'user-5678',
        required: false,
      })
      @IsOptional()
      @IsUUID()
      deletedBy?: string;



      // staff update
      @ApiProperty({
        type: String,
        description: 'hospital staff department',
        example: 'pharmacy',
        required: false,
      })
      @IsOptional()
      @IsString()
      department?: string


      @ApiProperty({
        enum: HospitalStaffRole,
        description: 'hospital staff role',
        example: 'PHARMACIST',
        required: false,
      })
      @IsOptional()
      @IsEnum(HospitalStaffRole)
      role?: HospitalStaffRole;


      // patient update
      @ApiProperty({
        type: String,
        description: 'hospital staff department',
        example: 'pharmacy',
        required: false,
      })
      @IsOptional()
      @IsDateString()
      dateOfBirth?: Date

      @ApiProperty({
        enum: Gender,
        description: 'gender of patient',
        example: 'FEMALE',
        required: false,
      })
      @IsOptional()
      @IsEnum(Gender)
      sex?: Gender

      @ApiProperty({
        enum: MaritalStatus,
        description: 'marital status of patient',
        example: 'SINGLE',
        required: false,
      })
      @IsOptional()
      @IsEnum(MaritalStatus)
      maritalStatus?: MaritalStatus

      @ApiProperty({
        type: String,
        description: 'nationality of patient',
        example: 'nigerian',
        required: false,
      })
      @IsOptional()
      @IsString()
      nationality?: string


      @ApiProperty({
        type: String,
        description: 'occupation of patient',
        example: 'doctor',
        required: false,
      })
      @IsOptional()
      @IsString()
      occupation?: string

      @ApiProperty({
        type: String,
        description: 'religion of patient',
        example: 'christain',
        required: false,
      })
      @IsOptional()
      @IsString()
      religion?: string


      @ApiProperty({
        type: String,
        description: 'ethnicity of patient',
        example: 'efik',
        required: false,
      })
      @IsOptional()
      @IsString()
      ethnicity?: string


      @ApiProperty({
        type: String,
        description: 'spoken languages of patient',
        example: 'efik',
        required: false,
      })
      @IsOptional()
      @IsString()
      spokenLanguages?: string[]

      @ApiProperty({
        enum: BLOOD_GROUP,
        description: 'bloodGroup of patient',
        example: 'B_POS',
        required: false,
      })
      @IsOptional()
      @IsEnum(BLOOD_GROUP)
      bloodGroup?: BLOOD_GROUP

      @ApiProperty({
        enum: GENOTYPE,
        description: 'genotype of patient',
        example: 'AA',
        required: false,
      })
      @IsOptional()
      @IsEnum(GENOTYPE)
      genotype?: GENOTYPE

      @ApiProperty({
        enum: BillingType,
        description: 'billingtype of patient',
        example: 'SELF_PAYING',
        required: false,
      })
      @IsOptional()
      @IsEnum(BillingType)
      billingtype?: BillingType
}


export class UpdateUserPasswordDto{
  @ApiProperty({ type: 'string', required: false })
  @IsUUID()
  @IsNotEmpty()
  id?: string; // this is not a user ID but the personalAccesstoken Id

  @ApiProperty({ type: 'string', required: false })
  @IsUUID()
  @IsNotEmpty()
  userId?: string; // this is a user ID for logged in users

  @ApiProperty({ type: 'string', required: false })
  @IsNotEmpty()
  @IsStrongPassword()
  @Length(10, 15)
  oldPassword?: string;

  @ApiProperty({ type: 'string', required: true })
  @IsNotEmpty()
  @IsStrongPassword()
  @Length(10, 15)
  password!: string;

  @ApiProperty({ type: 'string', required: false })
  @IsString()
  @IsNotEmpty()
  token?: string;
}
