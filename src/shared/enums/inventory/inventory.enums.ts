// Mirrors the inventory enums in prisma/schema.prisma (PRD 15).

export enum DosageForm {
    TABLET = 'TABLET',
    CAPSULE = 'CAPSULE',
    SYRUP = 'SYRUP',
    SUSPENSION = 'SUSPENSION',
    SOLUTION = 'SOLUTION',
    INJECTION = 'INJECTION',
    INFUSION = 'INFUSION',
    CREAM = 'CREAM',
    OINTMENT = 'OINTMENT',
    GEL = 'GEL',
    DROPS = 'DROPS',
    INHALER = 'INHALER',
    SUPPOSITORY = 'SUPPOSITORY',
    PESSARY = 'PESSARY',
    POWDER = 'POWDER',
    PATCH = 'PATCH',
    OTHER = 'OTHER',
}

export enum DrugRoute {
    ORAL = 'ORAL',
    IV = 'IV',
    IM = 'IM',
    SC = 'SC',
    TOPICAL = 'TOPICAL',
    INHALATION = 'INHALATION',
    RECTAL = 'RECTAL',
    VAGINAL = 'VAGINAL',
    OPHTHALMIC = 'OPHTHALMIC',
    OTIC = 'OTIC',
    NASAL = 'NASAL',
    SUBLINGUAL = 'SUBLINGUAL',
    OTHER = 'OTHER',
}

/** Where a drug list's rows come from (PRD 15 §3.1): seeded by CareFusion, or added by the hospital. */
export enum DrugSource {
    SYSTEM = 'SYSTEM',
    HOSPITAL = 'HOSPITAL',
}

export enum StorageCondition {
    ROOM_TEMPERATURE = 'ROOM_TEMPERATURE',
    COOL = 'COOL',
    REFRIGERATED = 'REFRIGERATED',
    FROZEN = 'FROZEN',
}

export enum BatchQuality {
    RELEASED = 'RELEASED',
    ON_HOLD = 'ON_HOLD',
    RECALLED = 'RECALLED',
}

export enum LocationType {
    STORE = 'STORE',
    DISPENSARY = 'DISPENSARY',
    WARD = 'WARD',
    THEATRE = 'THEATRE',
    CLINIC = 'CLINIC',
    OTHER = 'OTHER',
}

export enum StockStatus {
    AVAILABLE = 'AVAILABLE',
    QUARANTINE = 'QUARANTINE',
    DAMAGED = 'DAMAGED',
}

export enum StockTransactionType {
    OPENING = 'OPENING',
    RECEIPT = 'RECEIPT',
    STATUS_CHANGE = 'STATUS_CHANGE',
    ISSUE = 'ISSUE',
    ISSUE_RETURN = 'ISSUE_RETURN',
}

export enum ReceiptType {
    DELIVERY = 'DELIVERY',
    OPENING = 'OPENING',
}

export enum ReceiptStatus {
    DRAFT = 'DRAFT',
    POSTED = 'POSTED',
    CANCELLED = 'CANCELLED',
}
