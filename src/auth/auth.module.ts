import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { PermissionsGuard } from './permissions.guard';
import { SessionsService } from './sessions.service';

// Global so any module's controllers can use @Authorize() and any service can force re-logins.
@Global()
@Module({
    imports: [JwtModule.register({})],
    controllers: [AuthController],
    providers: [AuthService, JwtAuthGuard, PermissionsGuard, SessionsService],
    exports: [JwtModule, JwtAuthGuard, PermissionsGuard, SessionsService],
})
export class AuthModule {}
