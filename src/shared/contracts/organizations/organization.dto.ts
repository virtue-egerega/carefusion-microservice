import { BusinessType, OrgType, PaymentPlan } from "@shared/enums/organizations/organization.enums";

export interface OrganizationDto {
  id: string;
  name: string;
  address: string;
  logo?: string;
  phone: string[];
  email: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  website?: string;
  slogan?: string;
  pobox?: string;
  nfcCardFee: number;
  registrationFee: number;
  consultationFee: number;
  consultationPayment: string;
  maxUnpaidBeforeHold: number;
  patientNumberStart: number;
  neonateMaxDays: number;
  infantBelowYears: number;
  underFiveBelowYears: number;
  childMaxYears: number;
  paediatricMaxAge: number | null;
  geriatricMinAge: number | null;
  paymentPlan?: PaymentPlan;
  businessType: BusinessType;
  orgType: OrgType;
  healthcareNetworkId?: string;
  healthcareNetworkName?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}
