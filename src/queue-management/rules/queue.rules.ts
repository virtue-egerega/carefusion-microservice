export type TaskCounts = { total: number; waiting: number; held: number; called: number; inService: number };

const EMPTY: TaskCounts = { total: 0, waiting: 0, held: 0, called: 0, inService: 0 };

const FIELD: Record<string, keyof Omit<TaskCounts, 'total'>> = {
    WAITING:    'waiting',
    HELD:       'held',
    CALLED:     'called',
    IN_SERVICE: 'inService',
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
