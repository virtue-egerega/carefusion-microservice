import { Test, TestingModule } from '@nestjs/testing';
import { QueueManagementService } from './queue-management.service';

describe('QueueManagementService', () => {
  let service: QueueManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueManagementService],
    }).compile();

    service = module.get<QueueManagementService>(QueueManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
