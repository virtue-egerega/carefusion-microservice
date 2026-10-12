import {
    IsBoolean,
    IsDate,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

export class NotificationDto {
    @IsUUID()
    id: string = '';

    @IsUUID()
    userId: string = '';

    @IsString()
    message: string = '';

    @IsString()
    type: string = '';

    @IsBoolean()
    isRead: boolean = false;

    @IsDate()
    createdAt: Date = new Date();

    @IsDate()
    updatedAt: Date = new Date();

    @IsOptional()
    @IsDate()
    deletedAt: Date | null = null;

    @IsOptional()
    @IsUUID()
    deletedBy: string | null = null;
}