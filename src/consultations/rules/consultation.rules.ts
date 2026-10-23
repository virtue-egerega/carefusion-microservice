// Pure consultation rules (PRD 14), no DB access. Unit-tested in consultation.rules.spec.ts.

// ── Sections by age and sex (14 §3.8) ────────────────────────────────────────

export const CHILDREN_FIELDS = ['birthHistory', 'immunisationHistory', 'developmentHistory', 'feedingHistory'] as const;
export const WOMEN_FIELDS = ['lastMenstrualPeriod', 'gravida', 'parity', 'abortions', 'contraception'] as const;

const CHILD_AGE_GROUPS = ['NEONATE', 'INFANT', 'UNDER_FIVE', 'CHILD', 'ADOLESCENT'];
const REPRODUCTIVE_AGE_GROUPS = ['ADOLESCENT', 'ADULT'];

export type Sections = { children: boolean; women: boolean };

/** Which of the children's and women's sections apply. Unknown age or sex: both do. */
export function applicableSections(ageGroup: string | null, sex: string | null): Sections {
    return {
        children: !ageGroup || CHILD_AGE_GROUPS.includes(ageGroup),
        women:    (!sex || sex === 'FEMALE') && (!ageGroup || REPRODUCTIVE_AGE_GROUPS.includes(ageGroup)),
    };
}

const given = (value: unknown) => value !== null && value !== undefined;

/** Why these changes can't be saved for this patient: a section that doesn't apply. Clearing one is fine. */
export function sectionProblem(changes: Record<string, unknown>, sections: Sections): string | null {
    if (!sections.children && CHILDREN_FIELDS.some(field => given(changes[field]))) return "The children's history doesn't apply to this patient";
    if (!sections.women && WOMEN_FIELDS.some(field => given(changes[field]))) return "The menstrual and obstetric history doesn't apply to this patient";
    return null;
}

// ── Dates and counts ─────────────────────────────────────────────────────────

/** The calendar day in Lagos, "2026-10-23": what "today" means to the doctor. */
export function lagosDay(at: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(at);
}

// a date-only field arrives as midnight UTC of the day meant
const day = (date: Date) => date.toISOString().slice(0, 10);

type Obstetric = { gravida?: number | null; parity?: number | null; abortions?: number | null };

/** Why the saved note's dates or obstetric counts can't be right. Null if they're fine. */
export function datesAndCountsProblem(
    note: Obstetric & { lastMenstrualPeriod?: Date | null; followUpOn?: Date | null },
    now: Date,
): string | null {
    const today = lagosDay(now);
    if (note.lastMenstrualPeriod && day(note.lastMenstrualPeriod) > today) return "The last menstrual period can't be in the future";
    if (note.followUpOn && day(note.followUpOn) < today) return "The follow-up date can't be in the past";
    if (given(note.gravida) && note.gravida! < (note.parity ?? 0) + (note.abortions ?? 0)) {
        return "Births and losses together can't exceed the number of pregnancies (gravida)";
    }
    return null;
}

// ── Lists (14 §3.3, §4) ──────────────────────────────────────────────────────

type SystemFinding = { system: string; normal?: boolean; findings?: string | null };
type Sign = { sign: string; present: boolean; grade?: number | null };

/** Why a review-of-systems or examination list can't be saved: a system twice, or a row that says nothing. */
export function systemListProblem(rows: SystemFinding[], what: string): string | null {
    const seen = new Set<string>();
    for (const row of rows) {
        if (seen.has(row.system)) return `${what}: ${row.system} is listed twice`;
        seen.add(row.system);
        if (!row.normal && !row.findings?.trim()) return `${what}: mark ${row.system} normal or enter the findings`;
    }
    return null;
}

/** Why a general examination checklist can't be saved: a sign twice, or a grade on an absent sign. */
export function generalSignsProblem(rows: Sign[]): string | null {
    const seen = new Set<string>();
    for (const row of rows) {
        if (seen.has(row.sign)) return `General examination: ${row.sign} is listed twice`;
        seen.add(row.sign);
        if (given(row.grade) && !row.present) return `General examination: ${row.sign} can only be graded when present`;
    }
    return null;
}

// ── Diagnoses (14 §5) ────────────────────────────────────────────────────────

type DiagnosisFlags = { isPrimary: boolean; certainty: string; reported: boolean };

/** Why a diagnosis can't be saved as it stands. Null if it's fine. */
export function diagnosisProblem(d: DiagnosisFlags): string | null {
    if (d.reported && !['PROVISIONAL', 'CONFIRMED'].includes(d.certainty)) return 'A diagnosis from the history is provisional or confirmed';
    if (d.isPrimary && d.reported) return "The primary diagnosis is this visit's, not one from the history";
    if (d.isPrimary && !['PROVISIONAL', 'CONFIRMED'].includes(d.certainty)) return "The primary diagnosis can't be a differential or ruled out";
    return null;
}

// ── Signing (14 §7) ──────────────────────────────────────────────────────────

/** Why a draft can't be signed yet: no complaint, no primary diagnosis, no outcome, or a follow-up with no date. */
export function signProblem(note: { complaints: number; hasPrimary: boolean; outcome: string | null; followUpOn: Date | null }): string | null {
    if (!note.complaints) return 'Add at least one presenting complaint before signing';
    if (!note.hasPrimary) return 'Add a primary diagnosis before signing';
    if (!note.outcome) return 'Record the outcome before signing';
    if (note.outcome === 'FOLLOW_UP' && !note.followUpOn) return 'Give the follow-up date before signing';
    return null;
}
