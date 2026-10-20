import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PatientsModule } from './patients/patients.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BillingModule } from './billing/billing.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { LaboratoryModule } from './laboratory/laboratory.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { EnumsModule } from './enums/enums.module';
import { DepartmentsModule } from './departments/departments.module';
import { AuthModule } from './auth/auth.module';
import { AccessControlModule } from './access-control/access-control.module';
import { StaffModule } from './staff/staff.module';
import { EncountersModule } from './encounters/encounters.module';
import { QueueManagementModule } from'./queue-management/queue-management.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        CacheModule,
        CloudinaryModule,
        PatientsModule,
        OrganizationsModule,
        NotificationsModule,
        AppointmentsModule,
        BillingModule,
        ConsultationsModule,
        LaboratoryModule,
        PharmacyModule,
        EnumsModule,
        DepartmentsModule,
        AuthModule,
        AccessControlModule,
        StaffModule,
        EncountersModule,
        QueueManagementModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
