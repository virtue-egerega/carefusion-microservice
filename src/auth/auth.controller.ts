import { Body, Controller, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { LoginDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from '@shared/contracts/auth';

const REFRESH_COOKIE = 'refresh_token';
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms — matches JWT_REFRESH_TOKEN_EXPIRES_IN
    path: '/',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @ApiOperation({ summary: 'Staff login' })
    @Post('login')
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const { refresh_token, ...body } = await this.authService.login(dto);
        res.cookie(REFRESH_COOKIE, refresh_token, cookieOptions);
        return body;
    }

    @ApiOperation({ summary: 'Change password (requires Bearer token)' })
    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(req.user.sub, dto);
    }

    @ApiOperation({ summary: 'Request a password reset token' })
    @Post('forgot-password')
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }

    @ApiOperation({ summary: 'Reset password using the token' })
    @Post('reset-password')
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }
}
