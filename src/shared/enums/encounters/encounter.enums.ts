// Mirrors the encounter enums in prisma/schema.prisma (PRD 11).

/** How the patient came (11 §3.1). */
export enum VisitType {
    WALK_IN = 'WALK_IN',
    APPOINTMENT = 'APPOINTMENT',
    REFERRAL_IN = 'REFERRAL_IN',
    SELF_PRESENTED_EMERGENCY = 'SELF_PRESENTED_EMERGENCY',
    AMBULANCE = 'AMBULANCE',
    POLICE = 'POLICE',
    TRANSFER_IN = 'TRANSFER_IN',
    SERVICE_ONLY = 'SERVICE_ONLY',
    BIRTH = 'BIRTH',
}

/** Whether the patient was admitted to a bed. */
export enum EncounterType {
    OUTPATIENT = 'OUTPATIENT',
    INPATIENT = 'INPATIENT',
}

export enum EncounterStatus {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
    CANCELLED = 'CANCELLED',
}

/** Emergency triage acuity, most urgent first. Colours are the frontend's to choose per scale. */
export enum Acuity {
    IMMEDIATE = 'IMMEDIATE',
    VERY_URGENT = 'VERY_URGENT',
    URGENT = 'URGENT',
    ROUTINE = 'ROUTINE',
    DEAD_ON_ARRIVAL = 'DEAD_ON_ARRIVAL',
}

export enum Disposition {
    DISCHARGED_HOME = 'DISCHARGED_HOME',
    TRANSFERRED_OUT = 'TRANSFERRED_OUT',
    REFERRED_OUT = 'REFERRED_OUT',
    LEFT_WITHOUT_BEING_SEEN = 'LEFT_WITHOUT_BEING_SEEN',
    LEFT_BEFORE_COMPLETION = 'LEFT_BEFORE_COMPLETION',
    LEFT_AGAINST_ADVICE = 'LEFT_AGAINST_ADVICE',
    ABSCONDED = 'ABSCONDED',
    DIED = 'DIED',
    BROUGHT_IN_DEAD = 'BROUGHT_IN_DEAD',
    SERVICE_COMPLETED = 'SERVICE_COMPLETED',
}

export enum QueuePriority {
    EMERGENCY = 'EMERGENCY',
    URGENT = 'URGENT',
    ROUTINE = 'ROUTINE',
}

/** A task's status on a staff task list (11 §5). */
export enum QueueEntryStatus {
    WAITING = 'WAITING',
    HELD = 'HELD',
    CALLED = 'CALLED',
    IN_SERVICE = 'IN_SERVICE',
    COMPLETED = 'COMPLETED',
    NO_SHOW = 'NO_SHOW',
    TRANSFERRED = 'TRANSFERRED',
    CANCELLED = 'CANCELLED',
}

export enum HoldReason {
    AWAITING_PAYMENT = 'AWAITING_PAYMENT',
    AWAITING_PREAUTH = 'AWAITING_PREAUTH',
    AWAITING_RESULT = 'AWAITING_RESULT',
}
