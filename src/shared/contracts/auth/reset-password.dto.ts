import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
    @ApiProperty({ example: 'a3f2c1...' })
    @IsString()
    @IsNotEmpty()
    token!: string;

    @ApiProperty({ example: 'NewPassword456!' })
    @IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
    @IsNotEmpty()
    newPassword!: string;
}
