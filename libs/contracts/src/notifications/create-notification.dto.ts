import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString, IsOptional } from 'class-validator';


export enum NotificationType {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
}

export class CreateNotificationDto {

    @ApiProperty({ description: 'ID of the user receiving the notification' })
    @IsString()
    @IsNotEmpty()
    userId: string;
  
    @ApiProperty({ example: 'You have a new message', description: 'Notification message' })
    @IsString()
    @IsNotEmpty()
    message: string;
  
    @ApiProperty({ example: 'INFO', enum: NotificationType, description: 'Type of notification' })
    @IsEnum(NotificationType)
    @IsNotEmpty()
    type: NotificationType;
  
    @ApiProperty({ example: false, description: 'Indicates whether the notification has been read' })
    @IsOptional()
    isRead?: boolean;
}

