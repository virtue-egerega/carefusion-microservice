import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';
import { BranchStatus } from '@shared/enums/organizations/organization.enums';

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @ApiProperty({ enum: BranchStatus, required: false })
  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  updatedBy?: string;
}
