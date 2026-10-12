import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { DutyProfileService } from './duty-profile.service';
import { DutyProfileController } from './duty-profile.controller';
import { PermissionsController } from './permissions.controller';

@Module({
    controllers: [DutyProfileController, PermissionsController],
    providers: [AccessControlService, DutyProfileService],
    exports: [AccessControlService, DutyProfileService],
})
export class AccessControlModule {}
