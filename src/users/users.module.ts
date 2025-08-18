import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { HospitalsController } from './hospitals.controller';
import { UsersService, HospitalsService, UploadService } from './users.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UsersController, HospitalsController],
  providers: [UsersService, HospitalsService, UploadService],
})
export class UsersModule {}
