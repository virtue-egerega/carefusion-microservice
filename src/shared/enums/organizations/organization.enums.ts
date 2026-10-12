
export enum PaymentPlan {
    EPIC = 'EPIC',
    PREMIUM = 'PREMIUM',
    EXQUISITE = 'EXQUISITE',
}

export enum BusinessType {
    HOSPITAL = 'HOSPITAL',
    LABORATORY = 'LABORATORY',
    PHARMACY = 'PHARMACY',
}

export enum OrgType {
    STANDALONE = 'STANDALONE',
    CHAIN = 'CHAIN',
}

export interface OrganizationFilter {
  city?: string,
  state?: string,
  country?: string,
  paymentPlan?: string,
}

export enum BranchStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CLOSED = 'CLOSED',
}
