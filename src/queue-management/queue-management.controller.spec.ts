import { Test, TestingModule } from '@nestjs/testing';
import { QueueManagementController } from './queue-management.controller';
import { QueueManagementService } from './queue-management.service';

describe('QueueManagementController', () => {
  let controller: QueueManagementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueManagementController],
      providers: [QueueManagementService],
    }).compile();

    controller = module.get<QueueManagementController>(QueueManagementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
