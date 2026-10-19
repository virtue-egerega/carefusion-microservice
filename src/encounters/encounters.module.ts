import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { StartEncounterController } from './start-encounter/start-encounter.controller';
import { StartEncounterService } from './start-encounter/start-encounter.service';
import { ClinicsController } from './clinics/clinics.controller';
import { ClinicsService } from './clinics/clinics.service';
import { FollowUpController } from './follow-up/follow-up.controller';
import { FollowUpService } from './follow-up/follow-up.service';
import { SendingController } from './sending/sending.controller';
import { SendingService } from './sending/sending.service';
import { TaskFactory } from './shared/task-factory';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { WorklistsController } from './worklists/worklists.controller';
import { WorklistsService } from './worklists/worklists.service';

@Module({
    imports: [BillingModule],
    controllers: [ClinicsController, StartEncounterController, FollowUpController, SendingController, TasksController, WorklistsController],
    providers: [ClinicsService, StartEncounterService, FollowUpService, SendingService, TasksService, WorklistsService, TaskFactory],
})
export class EncountersModule {}
