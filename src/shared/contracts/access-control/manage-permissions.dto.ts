import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ManagePermissionsDto {
    @ApiProperty({ description: 'Permission keys to add, e.g. ["patient.view","triage.create"]', type: [String] })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    permissionKeys!: string[];
}
