import { allowedFrom, closesEncounter, leavingDisposition, transitionProblem } from './tasks.rules';

describe('transitionProblem', () => {
    it('lets staff call, start and complete a waiting task', () => {
        expect(transitionProblem('WAITING', 'call')).toBeNull();
        expect(transitionProblem('WAITING', 'start')).toBeNull();
        expect(transitionProblem('WAITING', 'complete')).toBeNull();
    });

    it('lets a called patient be called again, or started', () => {
        expect(transitionProblem('CALLED', 'call')).toBeNull();
        expect(transitionProblem('CALLED', 'start')).toBeNull();
    });

    it('completes a task that has started, but does not restart or recall it', () => {
        expect(transitionProblem('IN_SERVICE', 'complete')).toBeNull();
        expect(transitionProblem('IN_SERVICE', 'start')).toBe('This task has already started');
        expect(transitionProblem('IN_SERVICE', 'call')).toBe('This task has already started');
    });

    it("won't attend to a patient held for payment, but can cancel the task (11 §6)", () => {
        expect(transitionProblem('HELD', 'call')).toBe('This patient is waiting for payment');
        expect(transitionProblem('HELD', 'start')).toBe('This patient is waiting for payment');
        expect(transitionProblem('HELD', 'complete')).toBe('This patient is waiting for payment');
        expect(transitionProblem('HELD', 'cancel')).toBeNull();
    });

    it('refuses to touch a finished task', () => {
        expect(transitionProblem('COMPLETED', 'complete')).toBe('This task is already completed');
        expect(transitionProblem('CANCELLED', 'cancel')).toBe('This task is already cancelled');
        expect(transitionProblem('NO_SHOW', 'start')).toBe('This task is already no show');
    });
});

describe('allowedFrom', () => {
    it('can cancel any task still on a list', () => {
        expect(allowedFrom('cancel')).toEqual(['WAITING', 'HELD', 'CALLED', 'IN_SERVICE']);
    });
});

describe('closesEncounter', () => {
    it('closes the visit when the last station lets the patient go (11 §14)', () => {
        expect(closesEncounter(0)).toBe(true);
    });

    it('keeps it open while another station still has a task (lab done, pharmacy waiting)', () => {
        expect(closesEncounter(1)).toBe(false);
    });

    it('keeps it open when the patient is sent on to another station', () => {
        expect(closesEncounter(0, 'pharmacy-queue')).toBe(false);
    });
});

describe('leavingDisposition', () => {
    it('records a patient who left before any clinician saw them', () => {
        expect(leavingDisposition(null)).toBe('LEFT_WITHOUT_BEING_SEEN');
    });

    it('records a patient who was seen, then left with tasks unfinished', () => {
        expect(leavingDisposition(new Date('2026-10-19T09:00:00Z'))).toBe('LEFT_BEFORE_COMPLETION');
    });
});
