import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
    @ApiProperty({ example: 'user@hospital.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;
}
