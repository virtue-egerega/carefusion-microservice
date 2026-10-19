
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

/** When patients pay for a consultation (11 §6). Mirrors the ConsultationPayment enum in schema.prisma. */
export enum ConsultationPayment {
    BEFORE = 'BEFORE',   // the doctor's task waits until the visit's bill is paid
    AFTER = 'AFTER',     // nothing waits; the patient pays everything at the end
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
