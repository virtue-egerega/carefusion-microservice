import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { ACTIVE_TASK } from '../tasks/tasks.rules';

@Injectable()
export class WorklistsService {
    constructor(private readonly databaseService: DatabaseService) {}

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
