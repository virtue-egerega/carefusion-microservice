import {
    applicableSections, appliesToPatient, datesAndCountsProblem, diagnosisProblem, examFindingsProblem, generalSignsProblem, lagosDay,
    reviewFindingsProblem, sectionProblem, signProblem, systemNotesProblem,
} from './consultation.rules';

describe('applicableSections', () => {
    it("gives children's sections to children, women's to women of reproductive age", () => {
        expect(applicableSections('UNDER_FIVE', 'FEMALE')).toEqual({ children: true, women: false });
        expect(applicableSections('ADULT', 'FEMALE')).toEqual({ children: false, women: true });
        expect(applicableSections('ADULT', 'MALE')).toEqual({ children: false, women: false });
        expect(applicableSections('OLDER_ADULT', 'FEMALE')).toEqual({ children: false, women: false });
    });

    it('gives an adolescent girl both', () => {
        expect(applicableSections('ADOLESCENT', 'FEMALE')).toEqual({ children: true, women: true });
    });

    it('gives both when age or sex is unknown', () => {
        expect(applicableSections(null, null)).toEqual({ children: true, women: true });
        expect(applicableSections(null, 'MALE')).toEqual({ children: true, women: false });
        expect(applicableSections('ADULT', null)).toEqual({ children: false, women: true });
    });
});

describe('sectionProblem', () => {
    const adultMan = { children: false, women: false };

    it("refuses a section that doesn't apply", () => {
        expect(sectionProblem({ gravida: 2 }, adultMan)).toBe("The menstrual and obstetric history doesn't apply to this patient");
        expect(sectionProblem({ birthHistory: 'SVD at term' }, adultMan)).toBe("The children's history doesn't apply to this patient");
    });

    it('lets a section be cleared, and other fields through', () => {
        expect(sectionProblem({ gravida: null, birthHistory: null, summary: 'x' }, adultMan)).toBeNull();
    });
});

describe('lagosDay', () => {
    it("is Lagos's calendar day, an hour ahead of UTC", () => {
        expect(lagosDay(new Date('2026-10-22T23:30:00Z'))).toBe('2026-10-23');
        expect(lagosDay(new Date('2026-10-22T22:30:00Z'))).toBe('2026-10-22');
    });
});

describe('datesAndCountsProblem', () => {
    const now = new Date('2026-10-23T09:00:00Z');

    it('accepts today and past periods, and today or later follow-ups', () => {
        expect(datesAndCountsProblem({ lastMenstrualPeriod: new Date('2026-10-23'), followUpOn: new Date('2026-10-23') }, now)).toBeNull();
        expect(datesAndCountsProblem({ lastMenstrualPeriod: new Date('2026-09-30'), followUpOn: new Date('2026-11-06') }, now)).toBeNull();
    });

    it('refuses a future period or a past follow-up', () => {
        expect(datesAndCountsProblem({ lastMenstrualPeriod: new Date('2026-10-24') }, now)).toBe("The last menstrual period can't be in the future");
        expect(datesAndCountsProblem({ followUpOn: new Date('2026-10-22') }, now)).toBe("The follow-up date can't be in the past");
    });

    it('needs gravida to cover births and losses', () => {
        expect(datesAndCountsProblem({ gravida: 3, parity: 2, abortions: 1 }, now)).toBeNull();
        expect(datesAndCountsProblem({ gravida: 2, parity: 2, abortions: 1 }, now)).toMatch(/can't exceed/);
        expect(datesAndCountsProblem({ parity: 2 }, now)).toBeNull();
    });
});

describe('generalSignsProblem', () => {
    it('accepts absent signs and graded present ones', () => {
        expect(generalSignsProblem([{ sign: 'PALLOR', present: true, grade: 2 }, { sign: 'JAUNDICE', present: false }])).toBeNull();
    });

    it('refuses a sign twice, or a grade on an absent sign', () => {
        expect(generalSignsProblem([{ sign: 'PALLOR', present: true }, { sign: 'PALLOR', present: false }])).toBe('General examination: PALLOR is listed twice');
        expect(generalSignsProblem([{ sign: 'OEDEMA', present: false, grade: 1 }])).toBe('General examination: OEDEMA can only be graded when present');
    });
});

describe('diagnosisProblem', () => {
    it('accepts a provisional or confirmed primary, and differentials', () => {
        expect(diagnosisProblem({ isPrimary: true, certainty: 'PROVISIONAL', reported: false })).toBeNull();
        expect(diagnosisProblem({ isPrimary: false, certainty: 'DIFFERENTIAL', reported: false })).toBeNull();
        expect(diagnosisProblem({ isPrimary: false, certainty: 'CONFIRMED', reported: true })).toBeNull();
    });

    it('refuses a primary that is a differential, ruled out, or from the history', () => {
        expect(diagnosisProblem({ isPrimary: true, certainty: 'DIFFERENTIAL', reported: false })).toBe("The primary diagnosis can't be a differential or ruled out");
        expect(diagnosisProblem({ isPrimary: true, certainty: 'RULED_OUT', reported: false })).toBe("The primary diagnosis can't be a differential or ruled out");
        expect(diagnosisProblem({ isPrimary: true, certainty: 'CONFIRMED', reported: true })).toBe("The primary diagnosis is this visit's, not one from the history");
    });

    it('refuses a reported diagnosis that is a differential or ruled out', () => {
        expect(diagnosisProblem({ isPrimary: false, certainty: 'RULED_OUT', reported: true })).toBe('A diagnosis from the history is provisional or confirmed');
    });
});

describe('signProblem', () => {
    const ready = { complaints: 2, hasPrimary: true, outcome: 'SENT_HOME', followUpOn: null };

    it('signs a note with a complaint, a primary diagnosis and an outcome', () => {
        expect(signProblem(ready)).toBeNull();
        expect(signProblem({ ...ready, outcome: 'FOLLOW_UP', followUpOn: new Date('2026-11-06') })).toBeNull();
    });

    it('says what is missing', () => {
        expect(signProblem({ ...ready, complaints: 0 })).toBe('Add at least one presenting complaint before signing');
        expect(signProblem({ ...ready, hasPrimary: false })).toBe('Add a primary diagnosis before signing');
        expect(signProblem({ ...ready, outcome: null })).toBe('Record the outcome before signing');
        expect(signProblem({ ...ready, outcome: 'FOLLOW_UP' })).toBe('Give the follow-up date before signing');
    });
});

describe('appliesToPatient', () => {
    const woman = { ageGroup: 'ADULT', sex: 'FEMALE' };
    const man = { ageGroup: 'ADULT', sex: 'MALE' };
    const girl = { ageGroup: 'UNDER_FIVE', sex: 'FEMALE' };

    it('applies an unrestricted symptom to everyone', () => {
        expect(appliesToPatient({}, man)).toBe(true);
        expect(appliesToPatient({}, girl)).toBe(true);
    });

    it('applies a symptom by sex, and to an unknown sex', () => {
        expect(appliesToPatient({ sex: 'FEMALE' }, woman)).toBe(true);
        expect(appliesToPatient({ sex: 'FEMALE' }, man)).toBe(false);
        expect(appliesToPatient({ sex: 'MALE' }, { ageGroup: 'ADULT', sex: null })).toBe(true);
    });

    it("applies children's and menstrual symptoms by the history sections' rules", () => {
        expect(appliesToPatient({ children: true }, girl)).toBe(true);
        expect(appliesToPatient({ children: true }, woman)).toBe(false);
        expect(appliesToPatient({ sex: 'FEMALE', reproductive: true }, woman)).toBe(true);
        expect(appliesToPatient({ sex: 'FEMALE', reproductive: true }, girl)).toBe(false);
    });
});

describe('reviewFindingsProblem', () => {
    const man = { ageGroup: 'ADULT', sex: 'MALE' };

    it('accepts symptoms from the list that apply', () => {
        expect(reviewFindingsProblem([{ symptom: 'COUGH' }, { symptom: 'HAEMOPTYSIS' }, { symptom: 'TESTICULAR_PAIN' }], man)).toBeNull();
    });

    it('refuses an unknown symptom, one listed twice, or one that does not apply', () => {
        expect(reviewFindingsProblem([{ symptom: 'SNEEZY' }], man)).toBe("Review of systems: SNEEZY isn't on the list");
        expect(reviewFindingsProblem([{ symptom: 'COUGH' }, { symptom: 'COUGH' }], man)).toBe('Review of systems: Cough is listed twice');
        expect(reviewFindingsProblem([{ symptom: 'VAGINAL_DISCHARGE' }], man)).toBe("Review of systems: Vaginal discharge doesn't apply to this patient");
        expect(reviewFindingsProblem([{ symptom: 'POOR_FEEDING' }], man)).toBe("Review of systems: Poor feeding doesn't apply to this patient");
    });
});

describe('examFindingsProblem', () => {
    const man = { ageGroup: 'ADULT', sex: 'MALE' };
    const woman = { ageGroup: 'ADULT', sex: 'FEMALE' };

    it('accepts normal items, and abnormal ones with their note', () => {
        expect(examFindingsProblem([
            { element: 'HEART_SOUNDS', finding: 'NORMAL' },
            { element: 'MURMURS', finding: 'ABNORMAL', note: 'Pansystolic murmur at the apex, grade 3/6' },
        ], man)).toBeNull();
    });

    it('needs a note on an abnormal finding', () => {
        expect(examFindingsProblem([{ element: 'SPLEEN', finding: 'ABNORMAL', note: ' ' }], man)).toBe('Examination: Spleen is marked abnormal; say what was found');
    });

    it('refuses an unknown item, one listed twice, or one that does not apply', () => {
        expect(examFindingsProblem([{ element: 'AURA', finding: 'NORMAL' }], man)).toBe("Examination: AURA isn't on the list");
        expect(examFindingsProblem([{ element: 'LIVER', finding: 'NORMAL' }, { element: 'LIVER', finding: 'NORMAL' }], man)).toBe('Examination: Liver is listed twice');
        expect(examFindingsProblem([{ element: 'SPECULUM', finding: 'NORMAL' }], man)).toBe("Examination: Speculum examination doesn't apply to this patient");
        expect(examFindingsProblem([{ element: 'SCROTUM_TESTES', finding: 'NORMAL' }], woman)).toBe("Examination: Scrotum and testes doesn't apply to this patient");
        expect(examFindingsProblem([{ element: 'FONTANELLE', finding: 'NORMAL' }], man)).toBe("Examination: Anterior fontanelle doesn't apply to this patient");
    });
});

describe('systemNotesProblem', () => {
    it('accepts one note per system', () => {
        expect(systemNotesProblem([{ system: 'RESPIRATORY', note: 'Snores' }, { system: 'SKIN', note: 'Old burn scar' }], 'Review of systems')).toBeNull();
    });

    it('refuses a system twice, or an empty note', () => {
        expect(systemNotesProblem([{ system: 'SKIN', note: 'a' }, { system: 'SKIN', note: 'b' }], 'Review of systems')).toBe('Review of systems: SKIN has two notes');
        expect(systemNotesProblem([{ system: 'SKIN', note: '  ' }], 'Examination')).toBe('Examination: the SKIN note is empty');
    });
});
