import { Test, TestingModule } from '@nestjs/testing';
import { MedicineManagementController } from './medicine-management.controller';
import { MedicineManagementService } from './medicine-management.service';

describe('MedicineManagementController', () => {
  let controller: MedicineManagementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicineManagementController],
      providers: [MedicineManagementService],
    }).compile();

    controller = module.get<MedicineManagementController>(MedicineManagementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
