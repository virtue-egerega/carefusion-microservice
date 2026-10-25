// Pure rules for the queue picker (no DB access) — unit-tested in queues.rules.spec.ts.

/**
 * Which queues the duty-profile picker offers (both access queues and send queues): only active,
 * undeleted queues can be linked to a profile. `search` matches the queue's or its department's name,
 * so searching "pharmacy" lists every pharmacy queue.
 */
export function pickerQueueWhere(search?: string) {
    const term = search?.trim();
    return {
        isActive:  true,
        deletedAt: null,
        ...(term && {
            OR: [
                { name: { contains: term, mode: 'insensitive' as const } },
                { department: { name: { contains: term, mode: 'insensitive' as const } } },
            ],
        }),
    };
}

/** The departments the picker pages over: undeleted ones holding at least one pickable queue. */
export function pickerDepartmentWhere(search?: string, departmentId?: string) {
    return {
        deletedAt: null,
        ...(departmentId && { id: departmentId }),
        queues: { some: pickerQueueWhere(search) },
    };
}
