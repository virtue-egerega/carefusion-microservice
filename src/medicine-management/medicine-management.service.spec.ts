import { Test, TestingModule } from '@nestjs/testing';
import { MedicineManagementService } from './medicine-management.service';

describe('MedicineManagementService', () => {
  let service: MedicineManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MedicineManagementService],
    }).compile();

    service = module.get<MedicineManagementService>(MedicineManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
