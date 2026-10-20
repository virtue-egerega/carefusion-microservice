// Mirrors the billables enums in prisma/schema.prisma (PRD 12).

export enum CatalogStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

/** How a price line's amount is worked out (PRD 12 §6.1). */
export enum PriceBasis {
    TARIFF = 'TARIFF',
    DISCOUNT = 'DISCOUNT',
    MARKUP = 'MARKUP',
    MANUAL = 'MANUAL',
}

/** Which rule supplied a resolved price (PRD 12 §9). */
export enum PriceSource {
    PAYER_LINE = 'PAYER_LINE',
    PAYER_DISCOUNT = 'PAYER_DISCOUNT',
    SELF_PAY = 'SELF_PAY',
}
