import { Module } from '@nestjs/common';
import { MedicineManagementService } from './medicine-management.service';
import { MedicineManagementController } from './medicine-management.controller';

@Module({
  controllers: [MedicineManagementController],
  providers: [MedicineManagementService],
})
export class MedicineManagementModule {}
