import { PartialType } from '@nestjs/swagger';
import { CreateQueueManagementDto } from './create-queue-management.dto';

export class UpdateQueueManagementDto extends PartialType(CreateQueueManagementDto) {}
