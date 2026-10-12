import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';


export class LoginUserDto {
    @ApiProperty({ type: 'string', required: true })
    @IsEmail()
    email!: string;

    @ApiProperty({ type: 'string', required: true })
    @IsNotEmpty()
    password!: string;
}
