/**
 * A queue is a staff task list, not a physical line (11 §5): a queue entry is one station's task
 * for the patient. These rules say which task moves are allowed and when the visit ends.
 */

export type TaskStatus = 'WAITING' | 'HELD' | 'AWAITING_SERVICE' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'NO_SHOW' | 'TRANSFERRED' | 'CANCELLED';
export type TaskAction = 'call' | 'start' | 'complete' | 'cancel';

/** Tasks still on someone's list. Mirrors the partial unique index on QueueEntry. */
export const ACTIVE_TASK = ['WAITING', 'HELD', 'AWAITING_SERVICE', 'CALLED', 'IN_SERVICE'] as const;

const ALLOWED_FROM: Record<TaskAction, readonly TaskStatus[]> = {
    call:     ['WAITING', 'AWAITING_SERVICE', 'CALLED'],                 // calling again is allowed
    start:    ['WAITING', 'AWAITING_SERVICE', 'CALLED'],
    complete: ['WAITING', 'AWAITING_SERVICE', 'CALLED', 'IN_SERVICE'],   // a quick task can be completed without starting it
    cancel:   ACTIVE_TASK,
};

/** The statuses a task may be in for this action. */
export function allowedFrom(action: TaskAction): TaskStatus[] {
    return [...ALLOWED_FROM[action]];
}

/** Why the action can't be taken on a task in this status, or null if it can. */
export function transitionProblem(status: TaskStatus, action: TaskAction): string | null {
    if (ALLOWED_FROM[action].includes(status)) return null;
    if (status === 'HELD') return 'This patient is waiting for payment';
    if (status === 'IN_SERVICE') return 'This task has already started';
    return `This task is already ${status.toLowerCase().replace('_', ' ')}`;
}

/**
 * Whether finishing a task ends the visit (11 §14): the station sends the patient nowhere next and
 * no other station still has a task for them. Lab done while pharmacy still has one → stays open.
 */
export function closesEncounter(otherActiveTasks: number, nextQueueId?: string | null): boolean {
    return !nextQueueId && otherActiveTasks === 0;
}

/** The disposition recorded when staff follow up a patient who left with tasks unfinished. */
export function leavingDisposition(firstSeenAt: Date | null): 'LEFT_WITHOUT_BEING_SEEN' | 'LEFT_BEFORE_COMPLETION' {
    return firstSeenAt ? 'LEFT_BEFORE_COMPLETION' : 'LEFT_WITHOUT_BEING_SEEN';
}
