import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ACTIVE_TASK } from '../encounters/tasks/tasks.rules';
import { WorklistQueryDto } from './dto/worklist-query.dto';
import { countsByQueue, servingOrder, worklistSearch } from './rules/queue.rules';

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
     * A queue's live task list at the caller's branch (11 §5.2), optionally narrowed to some
     * statuses and a search, in the order it's served. Only staff whose duty profiles include the
     * queue may see it (05 §7); that check is part of the same query. The counts, run alongside,
     * cover the whole list so the frontend can show them on status tabs.
     */
    async worklist(queueId: string, branchId: string, dutyProfileIds: string[], query: WorklistQueryDto = {}) {
        const client = this.databaseService.client;
        const myQueue = { dutyProfileQueues: { some: { dutyProfileId: { in: dutyProfileIds } } } };

        const [queue, rows] = await Promise.all([
            client.queue.findFirst({
                where: { id: queueId, deletedAt: null, ...myQueue },
                select: {
                    id: true,
                    name: true,
                    department: { select: { id: true, name: true } },
                    entries: {
                        where:   { branchId, status: { in: query.status?.length ? query.status : [...ACTIVE_TASK] }, ...worklistSearch(query.search) },
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
                                    id: true, code: true, visitType: true, reasonForVisit: true,
                                    ageAtArrivalDays: true, ageGroup: true, acuity: true, isMedicoLegal: true, arrivedAt: true,
                                    clinic: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            }),
            client.queueEntry.groupBy({
                by:     ['queueId', 'status'],
                where:  { queueId, branchId, status: { in: [...ACTIVE_TASK] }, queue: myQueue },
                _count: { _all: true },
            }),
        ]);
        if (!queue) throw new ForbiddenException("This queue isn't in any of your duty profiles");

        const { entries, ...rest } = queue;
        const counts = countsByQueue([queueId], rows.map(r => ({ queueId: r.queueId, status: r.status, count: r._count._all })));
        return {
            queue: rest,
            patients: counts.get(queueId)!,
            // One flat row per patient in line: what a waiting-room list shows
            entries: servingOrder(entries).map(({ patient, ...entry }) => ({
                ...entry,
                patient: { id: patient.id, patientNumber: patient.patientNumber, sex: patient.sex, ...patient.user },
            })),
        };
    }
}
