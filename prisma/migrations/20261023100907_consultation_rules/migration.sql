-- Consultation rules Prisma can't express (PRD 14). The service checks them first; these hold when
-- two saves land at the same moment.

-- At most one primary diagnosis per consultation (14 §5)
CREATE UNIQUE INDEX "Diagnosis_one_primary_per_consultation" ON "Diagnosis"("consultationId") WHERE "isPrimary";

-- The primary is the working diagnosis: not a differential, not ruled out, not from the history
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_primary_is_working" CHECK (
    NOT "isPrimary" OR (NOT "reported" AND "certainty" IN ('PROVISIONAL', 'CONFIRMED'))
);

-- A reported diagnosis (diagnosed elsewhere) is known or suspected, never a differential or ruled out
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_reported_certainty" CHECK (
    NOT "reported" OR "certainty" IN ('PROVISIONAL', 'CONFIRMED')
);

-- A grade (+ to +++) only on a sign found present (14 §4.1)
ALTER TABLE "ConsultationGeneralSign" ADD CONSTRAINT "ConsultationGeneralSign_grade" CHECK (
    "grade" IS NULL OR ("present" AND "grade" BETWEEN 1 AND 3)
);

-- Obstetric counts: never negative, and births plus losses can't exceed pregnancies (14 §3.8)
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_obstetric_counts" CHECK (
    COALESCE("gravida", 0) >= 0 AND COALESCE("parity", 0) >= 0 AND COALESCE("abortions", 0) >= 0
    AND ("gravida" IS NULL OR "gravida" >= COALESCE("parity", 0) + COALESCE("abortions", 0))
);

-- Signed exactly when it has a signing time (14 §7)
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_signed_at" CHECK (
    ("status" = 'SIGNED') = ("signedAt" IS NOT NULL)
);
