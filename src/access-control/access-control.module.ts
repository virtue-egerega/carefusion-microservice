import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { DutyProfileService } from './duty-profile.service';
import { DutyProfileController } from './duty-profile.controller';

@Module({
    controllers: [DutyProfileController],
    providers: [AccessControlService, DutyProfileService],
    exports: [AccessControlService, DutyProfileService],
})
export class AccessControlModule {}
