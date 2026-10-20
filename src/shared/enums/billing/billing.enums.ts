// Mirrors the billing enums in prisma/schema.prisma (PRD 10).

export enum BillingAccountType {
    INDIVIDUAL = 'INDIVIDUAL',
    FAMILY = 'FAMILY',
    PAYER = 'PAYER',
}

export enum AccountStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    CLOSED = 'CLOSED',
}

/** A ledger row's type (PRD 10 §3.3). Credits: DEPOSIT, REMITTANCE, WRITE_OFF, TRANSFER_IN; debits: CHARGE, REFUND, TRANSFER_OUT; either: ADJUSTMENT, REVERSAL. */
export enum AccountEntryType {
    DEPOSIT = 'DEPOSIT',
    REMITTANCE = 'REMITTANCE',
    CHARGE = 'CHARGE',
    WRITE_OFF = 'WRITE_OFF',
    REFUND = 'REFUND',
    TRANSFER_IN = 'TRANSFER_IN',
    TRANSFER_OUT = 'TRANSFER_OUT',
    ADJUSTMENT = 'ADJUSTMENT',
    REVERSAL = 'REVERSAL',
}

export enum PaymentMode {
    CASH = 'CASH',
    POS = 'POS',
    TRANSFER = 'TRANSFER',
    ONLINE = 'ONLINE',
    CHEQUE = 'CHEQUE',
}

export enum ServiceCategory {
    REGISTRATION = 'REGISTRATION',
    CONSULTATION = 'CONSULTATION',
    LABORATORY = 'LABORATORY',
    RADIOLOGY = 'RADIOLOGY',
    PHARMACY = 'PHARMACY',
    PROCEDURE = 'PROCEDURE',
    THEATRE = 'THEATRE',
    ADMISSION = 'ADMISSION',
    CONSUMABLE = 'CONSUMABLE',
    OTHER = 'OTHER',
}

export enum PaymentStatus {
    UNPAID = 'UNPAID',
    PART_PAID = 'PART_PAID',
    PAID = 'PAID',
    NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum PayerType {
    HMO = 'HMO',
    GOVERNMENT = 'GOVERNMENT',
    CORPORATE = 'CORPORATE',
    STAFF = 'STAFF',
}

export enum SettlementMode {
    CLAIMS = 'CLAIMS',
    DIRECT_INVOICE = 'DIRECT_INVOICE',
    INTERNAL = 'INTERNAL',
}

export enum OverLimitAction {
    BILL_TO_ACCOUNT = 'BILL_TO_ACCOUNT',
    REQUIRE_APPROVAL = 'REQUIRE_APPROVAL',
}

export enum MemberType {
    PRINCIPAL = 'PRINCIPAL',
    SPOUSE = 'SPOUSE',
    CHILD = 'CHILD',
    OTHER_DEPENDANT = 'OTHER_DEPENDANT',
}

export enum PolicyStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    TERMINATED = 'TERMINATED',
}
