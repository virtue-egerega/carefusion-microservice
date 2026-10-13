import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserType, UserStatus, HospitalStaffRole, Gender, MaritalStatus,
  BLOOD_GROUP, GENOTYPE, PublicHealthRole, NHISRole,
} from '@shared/enums/users/user.enums';
import {
  AccountStatus, BillingAccountType, MemberType, OverLimitAction, PayerType, PaymentMode, PaymentStatus,
  PolicyStatus, ServiceCategory, SettlementMode,
} from '@shared/enums/billing/billing.enums';
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
        publicHealthRole: toOptions(PublicHealthRole),
        nhisRole: toOptions(NHISRole),
      },
      organizations: {
        paymentPlan: toOptions(PaymentPlan),
        businessType: toOptions(BusinessType),
        orgType: toOptions(OrgType),
      },
      billing: {
        billingAccountType: toOptions(BillingAccountType),
        accountStatus: toOptions(AccountStatus),
        paymentMode: toOptions(PaymentMode),
        paymentStatus: toOptions(PaymentStatus),
        serviceCategory: toOptions(ServiceCategory),
        payerType: toOptions(PayerType),
        settlementMode: toOptions(SettlementMode),
        overLimitAction: toOptions(OverLimitAction),
        memberType: toOptions(MemberType),
        policyStatus: toOptions(PolicyStatus),
      },
      notifications: {
        notificationType: toOptions(NotificationType),
      },
    };
  }
}
