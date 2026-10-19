import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PatientNumbers } from './patient-numbers';
import { BillingModule } from '../billing/billing.module';

@Module({
    imports: [BillingModule],
    controllers: [PatientsController],
    providers: [PatientsService, PatientNumbers],
    exports: [PatientsService],
})
export class PatientsModule {}
