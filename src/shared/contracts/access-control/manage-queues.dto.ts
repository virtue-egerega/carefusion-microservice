import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ManageQueuesDto {
    @ApiProperty({ description: 'Queue ids to add', type: [String] })
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('all', { each: true })
    queueIds!: string[];
}
