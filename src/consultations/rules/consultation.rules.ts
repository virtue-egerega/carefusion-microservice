// Pure consultation rules (PRD 14), no DB access. Unit-tested in consultation.rules.spec.ts.

import { ROS_SYMPTOMS } from '../review-of-systems.catalog';
import { EXAM_ELEMENTS } from '../examination.catalog';

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

// ── General examination (14 §4.1) ───────────────────────────────────────────

type Sign = { sign: string; present: boolean; grade?: number | null };

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

// ── Review of systems and systemic examination lists (14 §3.3, §4.2) ─────────

type Patient = { ageGroup: string | null; sex: string | null };
type ListItem = { label: string; sex?: 'FEMALE' | 'MALE'; children?: true; reproductive?: true; retired?: true };

/** Whether a symptom or examination item applies to the patient: their sex, and the children's / women's rules (14 §3.8). */
export function appliesToPatient(item: Pick<ListItem, 'sex' | 'children' | 'reproductive'>, patient: Patient): boolean {
    const sections = applicableSections(patient.ageGroup, patient.sex);
    if (item.sex && patient.sex && patient.sex !== item.sex) return false;
    if (item.children && !sections.children) return false;
    if (item.reproductive && !sections.women) return false;
    return true;
}

/** Why findings against a list can't be saved: an unknown or retired item, one twice, or one that doesn't apply. */
function listFindingsProblem(codes: string[], list: Map<string, ListItem>, patient: Patient, what: string): string | null {
    const seen = new Set<string>();
    for (const code of codes) {
        const known = list.get(code);
        if (!known) return `${what}: ${code} isn't on the list`;
        if (known.retired) return `${what}: ${known.label} is no longer on the list`;
        if (seen.has(code)) return `${what}: ${known.label} is listed twice`;
        seen.add(code);
        if (!appliesToPatient(known, patient)) return `${what}: ${known.label} doesn't apply to this patient`;
    }
    return null;
}

/** Why review-of-systems findings can't be saved (14 §3.3). */
export function reviewFindingsProblem(rows: { symptom: string }[], patient: Patient): string | null {
    return listFindingsProblem(rows.map(r => r.symptom), ROS_SYMPTOMS, patient, 'Review of systems');
}

/** Why systemic examination findings can't be saved (14 §4.2): as for symptoms, and an abnormal finding needs its note. */
export function examFindingsProblem(rows: { element: string; finding: string; note?: string | null }[], patient: Patient): string | null {
    const problem = listFindingsProblem(rows.map(r => r.element), EXAM_ELEMENTS, patient, 'Examination');
    if (problem) return problem;
    const unexplained = rows.find(r => r.finding === 'ABNORMAL' && !r.note?.trim());
    return unexplained ? `Examination: ${EXAM_ELEMENTS.get(unexplained.element)!.label} is marked abnormal; say what was found` : null;
}

/** Why a list's per-system notes can't be saved: a system twice, or an empty note. */
export function systemNotesProblem(rows: { system: string; note: string }[], what: string): string | null {
    const seen = new Set<string>();
    for (const row of rows) {
        if (seen.has(row.system)) return `${what}: ${row.system} has two notes`;
        seen.add(row.system);
        if (!row.note.trim()) return `${what}: the ${row.system} note is empty`;
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
