import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { StaffController } from './staff.controller';
import { UsersService, UploadService } from './users.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UsersController, StaffController],
  providers: [UsersService, UploadService],
})
export class UsersModule {}
