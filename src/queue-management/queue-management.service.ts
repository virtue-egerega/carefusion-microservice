import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { $Enums } from '../../generated/prisma/client';
import { ACTIVE_TASK } from '../encounters/tasks/tasks.rules';
import { countsByQueue } from './rules/queue.rules';

@Injectable()
export class QueueManagementService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * The caller's queues (every queue in their duty profiles) with how many patients are on each
     * list at their branch, by status: what a staff member's home screen shows. Two queries, run
     * together; the counts' duty-profile filter is part of the count query.
     */
    async mine(branchId: string, dutyProfileIds: string[]) {
        const client = this.databaseService.client;
        const myQueue = { dutyProfileQueues: { some: { dutyProfileId: { in: dutyProfileIds } } } };

        const [queues, rows] = await Promise.all([
            client.queue.findMany({
                where:   { isActive: true, deletedAt: null, ...myQueue },
                orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
                select:  { id: true, name: true, systemKey: true, department: { select: { id: true, name: true } } },
            }),
            client.queueEntry.groupBy({
                by:     ['queueId', 'status'],
                where:  { branchId, status: { in: [...ACTIVE_TASK] }, queue: myQueue },
                _count: { _all: true },
            }),
        ]);

        const counts = countsByQueue(
            queues.map(q => q.id),
            rows.map(r => ({ queueId: r.queueId, status: r.status, count: r._count._all })),
        );
        return queues.map(queue => ({ ...queue, patients: counts.get(queue.id)! }));
    }

    /**
     * A queue's live task list at the caller's branch (11 §5.2): active entries, highest priority
     * first, then longest ready. Only staff whose duty profiles include the queue may see it
     * (05 §7); that check is part of the same query.
     */
    async worklist(queueId: string, branchId: string, dutyProfileIds: string[]) {
        const queue = await this.databaseService.client.queue.findFirst({
            where: {
                id: queueId,
                deletedAt: null,
                dutyProfileQueues: { some: { dutyProfileId: { in: dutyProfileIds } } },
            },
            select: {
                id: true,
                name: true,
                department: { select: { id: true, name: true } },
                entries: {
                    where:   { branchId, status: { in: [...ACTIVE_TASK] } },
                    orderBy: [{ priority: 'asc' }, { readyAt: 'asc' }],
                    select:  {
                        id: true, ticketNumber: true, priority: true, status: true, holdReason: true,
                        enteredAt: true, readyAt: true, calledAt: true,
                        patient: {
                            select: {
                                id: true, patientNumber: true, sex: true,
                                user: { select: { firstName: true, middleName: true, lastName: true } },
                            },
                        },
                        encounter: {
                            select: {
                                id: true, visitType: true, reasonForVisit: true,
                                ageAtArrivalDays: true, ageGroup: true, acuity: true, isMedicoLegal: true, arrivedAt: true,
                                clinic: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!queue) throw new ForbiddenException("This queue isn't in any of your duty profiles");

        const { entries, ...rest } = queue;
        return {
            queue: rest,
            waiting: entries.filter(e => e.status === $Enums.QueueEntryStatus.WAITING).length,
            held:    entries.filter(e => e.status === $Enums.QueueEntryStatus.HELD).length,
            // One flat row per patient in line: what a waiting-room list shows
            entries: entries.map(({ patient, ...entry }) => ({
                ...entry,
                patient: { id: patient.id, patientNumber: patient.patientNumber, sex: patient.sex, ...patient.user },
            })),
        };
    }
}
