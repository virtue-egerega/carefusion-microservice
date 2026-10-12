import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserType, UserStatus, HospitalStaffRole, Gender, MaritalStatus,
  BLOOD_GROUP, GENOTYPE, BillingType, TransactionMode, PublicHealthRole, NHISRole,
} from '@shared/enums/users/user.enums';
import { PaymentPlan, BusinessType, OrgType } from '@shared/enums/organizations/organization.enums';
import { NotificationType } from '@shared/contracts/notifications/create-notification.dto';

function toOptions(enumObj: Record<string, string>) {
  return Object.values(enumObj).map(value => ({
    value,
    label: value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  }));
}

@ApiTags('enums')
@Controller('enums')
export class EnumsController {
  @Get()
  @ApiOperation({ summary: 'Get all frontend-relevant enums for dropdowns and filters' })
  getAll() {
    return {
      users: {
        userType: toOptions(UserType),
        userStatus: toOptions(UserStatus),
        hospitalStaffRole: toOptions(HospitalStaffRole),
        gender: toOptions(Gender),
        maritalStatus: toOptions(MaritalStatus),
        bloodGroup: toOptions(BLOOD_GROUP),
        genotype: toOptions(GENOTYPE),
        billingType: toOptions(BillingType),
        transactionMode: toOptions(TransactionMode),
        publicHealthRole: toOptions(PublicHealthRole),
        nhisRole: toOptions(NHISRole),
      },
      organizations: {
        paymentPlan: toOptions(PaymentPlan),
        businessType: toOptions(BusinessType),
        orgType: toOptions(OrgType),
      },
      notifications: {
        notificationType: toOptions(NotificationType),
      },
    };
  }
}
