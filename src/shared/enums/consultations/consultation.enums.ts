// Mirrors of the consultation enums in prisma/schema.prisma (PRD 14), served to the frontend by GET /enums.

export enum ConsultationKind {
    INITIAL = 'INITIAL',
    FOLLOW_UP = 'FOLLOW_UP',
    RESULT_REVIEW = 'RESULT_REVIEW',
    REFERRAL = 'REFERRAL',
    EMERGENCY = 'EMERGENCY',
    WARD_ROUND = 'WARD_ROUND',
    ADMISSION_CLERKING = 'ADMISSION_CLERKING',
    PRE_OPERATIVE = 'PRE_OPERATIVE',
}

export enum ConsultationStatus {
    DRAFT = 'DRAFT',
    SIGNED = 'SIGNED',
}

export enum MedicationAdherence {
    GOOD = 'GOOD',
    PARTIAL = 'PARTIAL',
    POOR = 'POOR',
    NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum SmokingStatus {
    NEVER = 'NEVER',
    FORMER = 'FORMER',
    CURRENT = 'CURRENT',
}

export enum AlcoholUse {
    NONE = 'NONE',
    OCCASIONAL = 'OCCASIONAL',
    REGULAR = 'REGULAR',
    HEAVY = 'HEAVY',
}

export enum BodySystem {
    CONSTITUTIONAL = 'CONSTITUTIONAL',
    CARDIOVASCULAR = 'CARDIOVASCULAR',
    RESPIRATORY = 'RESPIRATORY',
    GASTROINTESTINAL = 'GASTROINTESTINAL',
    GENITOURINARY = 'GENITOURINARY',
    NEUROLOGICAL = 'NEUROLOGICAL',
    MUSCULOSKELETAL = 'MUSCULOSKELETAL',
    SKIN = 'SKIN',
    ENT = 'ENT',
    EYES = 'EYES',
    BREAST = 'BREAST',
    ENDOCRINE = 'ENDOCRINE',
    PSYCHIATRIC = 'PSYCHIATRIC',
    OTHER = 'OTHER',
}

export enum GeneralSign {
    PALLOR = 'PALLOR',
    JAUNDICE = 'JAUNDICE',
    CYANOSIS = 'CYANOSIS',
    CLUBBING = 'CLUBBING',
    LYMPHADENOPATHY = 'LYMPHADENOPATHY',
    OEDEMA = 'OEDEMA',
    DEHYDRATION = 'DEHYDRATION',
}

export enum DiagnosisCodeSystem {
    ICD_10 = 'ICD_10',
    ICD_11 = 'ICD_11',
}

export enum DiagnosisCertainty {
    PROVISIONAL = 'PROVISIONAL',
    DIFFERENTIAL = 'DIFFERENTIAL',
    CONFIRMED = 'CONFIRMED',
    RULED_OUT = 'RULED_OUT',
}

export enum ConsultationOutcome {
    SENT_HOME = 'SENT_HOME',
    AWAITING_RESULTS = 'AWAITING_RESULTS',
    FOLLOW_UP = 'FOLLOW_UP',
    REFERRED_INTERNAL = 'REFERRED_INTERNAL',
    REFERRED_OUT = 'REFERRED_OUT',
    ADMIT = 'ADMIT',
    LEFT_AGAINST_ADVICE = 'LEFT_AGAINST_ADVICE',
    DIED = 'DIED',
}
