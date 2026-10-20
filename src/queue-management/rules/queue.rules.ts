import type { Prisma } from '../../../generated/prisma/client';

export type TaskCounts = { total: number; waiting: number; held: number; awaitingService: number; called: number; inService: number };

const EMPTY: TaskCounts = { total: 0, waiting: 0, held: 0, awaitingService: 0, called: 0, inService: 0 };

const FIELD: Record<string, keyof Omit<TaskCounts, 'total'>> = {
    WAITING:          'waiting',
    HELD:             'held',
    AWAITING_SERVICE: 'awaitingService',
    CALLED:           'called',
    IN_SERVICE:       'inService',
};

/**
 * Patients on each queue's list, by status, from per-(queue, status) counts. Every queue in
 * `queueIds` gets an entry, so an empty list shows as zeros rather than going missing.
 */
export function countsByQueue(queueIds: string[], rows: { queueId: string; status: string; count: number }[]): Map<string, TaskCounts> {
    const counts = new Map(queueIds.map(id => [id, { ...EMPTY }]));
    for (const row of rows) {
        const queue = counts.get(row.queueId);
        const field = FIELD[row.status];
        if (!queue || !field) continue;
        queue[field] += row.count;
        queue.total += row.count;
    }
    return counts;
}

const PRIORITY_RANK: Record<string, number> = { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 };

/**
 * The order a worklist is served in (11 §5.2): highest priority first; within a priority, patients
 * whose service was interrupted to go and pay (AWAITING_SERVICE) come before everyone else, then
 * longest ready first.
 */
export function servingOrder<T extends { priority: string; status: string; readyAt: Date }>(entries: T[]): T[] {
    const resumed = (e: T) => (e.status === 'AWAITING_SERVICE' ? 0 : 1);
    return [...entries].sort((a, b) =>
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        || resumed(a) - resumed(b)
        || a.readyAt.getTime() - b.readyAt.getTime());
}

/**
 * Filter for a worklist search. Every word must match the patient's first, middle or last name;
 * a number matches the ticket or the patient number. "ada obi" finds Ada Chioma Obi.
 */
export function worklistSearch(search?: string): Prisma.QueueEntryWhereInput {
    const words = search?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (!words.length) return {};

    return {
        AND: words.map(word => ({
            OR: [
                { patient: { user: { firstName:  { contains: word, mode: 'insensitive' as const } } } },
                { patient: { user: { middleName: { contains: word, mode: 'insensitive' as const } } } },
                { patient: { user: { lastName:   { contains: word, mode: 'insensitive' as const } } } },
                ...(/^\d{1,9}$/.test(word) ? [{ ticketNumber: Number(word) }, { patient: { patientNumber: Number(word) } }] : []),
            ],
        })),
    };
}
