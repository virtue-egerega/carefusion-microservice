import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AllowsPasswordChangeRequired, JwtAuthGuard } from './jwt.guard';
import { CurrentUser } from './auth.decorators';
import type { AuthUser } from './permissions.guard';
import { LoginDto, ChangePasswordDto } from '@shared/contracts/auth';

const REFRESH_COOKIE = 'refresh_token';
const baseCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly jwtService: JwtService,
    ) {}

    @ApiOperation({
        summary: 'Login. With a temporary password, returns mustChangePassword: true and a token that can only change the password',
    })
    @Post('login')
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const { refresh_token, ...body } = await this.authService.login(dto);
        if (refresh_token) {
            // Cookie lives exactly as long as the refresh token (JWT_REFRESH_TOKEN_EXPIRES_IN)
            const { exp } = this.jwtService.decode(refresh_token) as { exp: number };
            res.cookie(REFRESH_COOKIE, refresh_token, { ...baseCookie, maxAge: exp * 1000 - Date.now() });
        }
        return body;
    }

    @ApiOperation({ summary: 'New access token from the refresh cookie (no database read)' })
    @Post('refresh')
    refresh(@Req() req: Request) {
        return this.authService.refresh(req.cookies?.[REFRESH_COOKIE]);
    }

    @ApiOperation({ summary: "Log out this device: revokes this session's access and refresh tokens" })
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @AllowsPasswordChangeRequired()
    @Post('logout')
    async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.logout(user, req.cookies?.[REFRESH_COOKIE]);
        res.clearCookie(REFRESH_COOKIE, baseCookie);
        return result;
    }

    @ApiOperation({ summary: 'Change password (requires Bearer token; also completes a forced change)' })
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @AllowsPasswordChangeRequired()
    @Post('change-password')
    changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(user.sub, dto);
    }
}
