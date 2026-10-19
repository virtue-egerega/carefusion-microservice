import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AddTaskDto } from '@shared/contracts/encounters';
import type { AuthUser } from '../../auth/permissions.guard';
import { TaskFactory } from '../shared/task-factory';

type At = { organizationId: string; branchId: string };

/**
 * Putting a patient on another station's list without working a task yourself (11 §5.7): reception
 * sending a patient to billing, a nurse adding one to the procedure room. Allowed only to the
 * queues on the caller's duty profiles' send lists, which grant no access to those lists.
 */
@Injectable()
export class SendingService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly tasks: TaskFactory,
    ) {}

    /** The queues the caller may send patients to, for the frontend picker. */
    sendable(user: AuthUser) {
        return this.databaseService.client.queue.findMany({
            where: {
                isActive: true,
                deletedAt: null,
                sendingProfiles: { some: { dutyProfileId: { in: user.dutyProfileIds } } },
            },
            orderBy: { name: 'asc' },
            select:  { id: true, name: true, systemKey: true, department: { select: { id: true, name: true } } },
        });
    }

    /** Adds a task for the patient's open encounter on one of the caller's send queues. */
    async addTask(encounterId: string, dto: AddTaskDto, at: At, user: AuthUser) {
        const client = this.databaseService.client;
        const now = new Date();

        const [[queue], maySend] = await Promise.all([
            this.tasks.loadQueues([dto.queueId]),
            client.dutyProfileSendQueue.count({ where: { dutyProfileId: { in: user.dutyProfileIds }, queueId: dto.queueId } }),
        ]);
        if (!maySend) throw new ForbiddenException("You can't send patients to that queue");
        if (!queue) throw new UnprocessableEntityException('That queue is switched off');

        return this.databaseService.transaction(async () => {
            // Locked so the visit can't close under us while the task is added
            const [encounter] = await this.databaseService.client.$queryRaw<{ patientId: string; status: string }[]>`
                SELECT "patientId", "status" FROM "Encounter"
                 WHERE "id" = ${encounterId} AND "organizationId" = ${at.organizationId} AND "branchId" = ${at.branchId}
                   FOR UPDATE`;
            if (!encounter) throw new NotFoundException('Encounter not found at this branch');
            if (encounter.status !== 'OPEN') throw new ConflictException('This visit has ended; check the patient in again');

            return this.tasks.create({
                encounterId,
                patientId:       encounter.patientId,
                branchId:        at.branchId,
                queue,
                by:              user.sub,
                now,
            });
        });
    }
}
