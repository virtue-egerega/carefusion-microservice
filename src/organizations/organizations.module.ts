import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { DepartmentsModule } from '../departments/departments.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [JwtModule.register({}), DepartmentsModule, AccessControlModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
