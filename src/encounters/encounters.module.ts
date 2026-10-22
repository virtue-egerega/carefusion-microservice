import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { QueueHoldsModule } from './queue-holds/queue-holds.module';
import { EncounterController } from './encounter.controller';
import { EncounterService } from './encounter.service';
import { SendingController } from './sending/sending.controller';
import { SendingService } from './sending/sending.service';
import { TaskFactory } from './shared/task-factory';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';

@Module({
    imports: [BillingModule, QueueHoldsModule],
    controllers: [EncounterController,SendingController, TasksController],
    providers: [EncounterService, SendingService, TasksService, TaskFactory],
})
export class EncountersModule {}
