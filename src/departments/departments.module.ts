import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { QueuesController } from './queues.controller';
import { DepartmentsService } from './departments.service';

@Module({
    controllers: [DepartmentsController, QueuesController],
    providers: [DepartmentsService],
    exports: [DepartmentsService],
})
export class DepartmentsModule {}
