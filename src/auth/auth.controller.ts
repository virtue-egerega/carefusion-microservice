import { Body, Controller, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AllowsPasswordChangeRequired, JwtAuthGuard } from './jwt.guard';
import { LoginDto, ChangePasswordDto } from '@shared/contracts/auth';

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

    @ApiOperation({
        summary: 'Login. With a temporary password, returns mustChangePassword: true and a token that can only change the password',
    })
    @Post('login')
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const { refresh_token, ...body } = await this.authService.login(dto);
        if (refresh_token) res.cookie(REFRESH_COOKIE, refresh_token, cookieOptions);
        return body;
    }

    @ApiOperation({ summary: 'Change password (requires Bearer token; also completes a forced change)' })
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @AllowsPasswordChangeRequired()
    @Post('change-password')
    changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(req.user.sub, dto);
    }
}
