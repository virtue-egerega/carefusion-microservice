import { correctedReading, retriageProblem, takenAtProblem, vitalsProblem } from './triage.rules';

describe('vitalsProblem', () => {
    it('accepts a reading with any one vital', () => {
        expect(vitalsProblem({ temperature: 37.8 })).toBeNull();
        expect(vitalsProblem({ weight: 18.4 })).toBeNull();
    });

    it('refuses a reading with no vitals', () => {
        expect(vitalsProblem({})).toBe('Enter at least one vital sign');
        expect(vitalsProblem({ temperature: null, pulse: undefined })).toBe('Enter at least one vital sign');
    });

    it('needs blood pressure as a pair', () => {
        expect(vitalsProblem({ systolic: 120, diastolic: 80 })).toBeNull();
        expect(vitalsProblem({ systolic: 120 })).toBe('Blood pressure needs both systolic and diastolic');
        expect(vitalsProblem({ diastolic: 80, pulse: 90 })).toBe('Blood pressure needs both systolic and diastolic');
    });
});

describe('takenAtProblem', () => {
    const arrivedAt = new Date('2026-10-22T07:00:00Z');
    const now = new Date('2026-10-22T09:00:00Z');

    it('accepts a time between arrival and now', () => {
        expect(takenAtProblem(new Date('2026-10-22T08:30:00Z'), arrivedAt, now)).toBeNull();
        expect(takenAtProblem(arrivedAt, arrivedAt, now)).toBeNull();
    });

    it('allows a few minutes of clock difference, not more', () => {
        expect(takenAtProblem(new Date('2026-10-22T09:04:00Z'), arrivedAt, now)).toBeNull();
        expect(takenAtProblem(new Date('2026-10-22T09:10:00Z'), arrivedAt, now)).toBe("A reading can't be taken in the future");
    });

    it('refuses a time before the patient arrived', () => {
        expect(takenAtProblem(new Date('2026-10-22T06:59:00Z'), arrivedAt, now)).toBe('A reading must be taken after the patient arrived');
    });
});

describe('correctedReading', () => {
    const old = { takenAt: new Date('2026-10-22T08:00:00Z'), notes: 'crying', temperature: 38.5, pulse: 110, systolic: 120, diastolic: 80 };

    it('applies the changed fields and keeps the rest', () => {
        const merged = correctedReading(old, { temperature: 37.5 });
        expect(merged).toMatchObject({ takenAt: old.takenAt, notes: 'crying', temperature: 37.5, pulse: 110, systolic: 120, diastolic: 80 });
    });

    it('clears a field sent as null', () => {
        const merged = correctedReading(old, { pulse: null, notes: null });
        expect(merged.pulse).toBeNull();
        expect(merged.notes).toBeNull();
    });

    it('can leave the reading invalid, for vitalsProblem to catch', () => {
        expect(vitalsProblem(correctedReading(old, { diastolic: null }))).toBe('Blood pressure needs both systolic and diastolic');
    });
});

describe('retriageProblem', () => {
    it('needs no reason for the first assessment', () => {
        expect(retriageProblem(false)).toBeNull();
    });

    it('needs a reason to re-triage', () => {
        expect(retriageProblem(true)).toBe('Give a reason for re-triaging');
        expect(retriageProblem(true, '   ')).toBe('Give a reason for re-triaging');
        expect(retriageProblem(true, 'Started convulsing')).toBeNull();
    });
});
