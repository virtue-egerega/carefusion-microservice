import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ACTIVE_TASK } from '../../encounters/tasks/tasks.rules';

export class WorklistQueryDto {
    @ApiProperty({
        required: false,
        enum: ACTIVE_TASK,
        isArray: true,
        description: 'Only tasks in these statuses: repeat the parameter or separate with commas (status=WAITING,AWAITING_SERVICE). Omit for everyone on the list.',
    })
    @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')).map((s: string) => s.trim()).filter(Boolean))
    @IsIn(ACTIVE_TASK, { each: true })
    @IsOptional()
    status?: (typeof ACTIVE_TASK)[number][];

    @ApiProperty({ required: false, description: "Patient's name (any part, every word must match), ticket number or patient number" })
    @IsString()
    @MaxLength(100)
    @IsOptional()
    search?: string;
}
