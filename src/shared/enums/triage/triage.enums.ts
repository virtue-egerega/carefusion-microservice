// Mirrors of the triage enums in prisma/schema.prisma (11 §8–9), served to the frontend by GET /enums.

export enum Avpu {
    ALERT = 'ALERT',
    VOICE = 'VOICE',
    PAIN = 'PAIN',
    UNRESPONSIVE = 'UNRESPONSIVE',
}

export enum DangerSign {
    UNABLE_TO_DRINK = 'UNABLE_TO_DRINK',
    PERSISTENT_VOMITING = 'PERSISTENT_VOMITING',
    CONVULSIONS = 'CONVULSIONS',
    LETHARGY = 'LETHARGY',
    SEVERE_DEHYDRATION = 'SEVERE_DEHYDRATION',
    DIFFICULTY_BREATHING = 'DIFFICULTY_BREATHING',
}

export enum VitalsContext {
    TRIAGE = 'TRIAGE',
    OBSERVATION = 'OBSERVATION',
    WARD_ROUND = 'WARD_ROUND',
    PRE_OP = 'PRE_OP',
    POST_OP = 'POST_OP',
}
