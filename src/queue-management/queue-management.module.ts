import { Module } from '@nestjs/common';
import { QueueManagementService } from './queue-management.service';
import { QueueManagementController } from './queue-management.controller';

@Module({
  controllers: [QueueManagementController],
  providers: [QueueManagementService],
})
export class QueueManagementModule {}
