import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { QueueHoldsModule } from './queue-holds/queue-holds.module';
import { StartEncounterController } from './start-encounter/start-encounter.controller';
import { StartEncounterService } from './start-encounter/start-encounter.service';
import { FollowUpController } from './follow-up/follow-up.controller';
import { FollowUpService } from './follow-up/follow-up.service';
import { SendingController } from './sending/sending.controller';
import { SendingService } from './sending/sending.service';
import { TaskFactory } from './shared/task-factory';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';

@Module({
    imports: [BillingModule, QueueHoldsModule],
    controllers: [StartEncounterController, FollowUpController, SendingController, TasksController],
    providers: [StartEncounterService, FollowUpService, SendingService, TasksService, TaskFactory],
})
export class EncountersModule {}
