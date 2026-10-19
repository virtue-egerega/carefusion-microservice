import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { isRecordNotFound } from '../../database/prisma-errors';
import { $Enums, Prisma } from '../../../generated/prisma/client';
import { CancelTaskDto, CompleteTaskDto } from '@shared/contracts/encounters';
import type { AuthUser } from '../../auth/permissions.guard';
import { TaskFactory } from '../shared/task-factory';
import { ACTIVE_TASK, TaskAction, TaskStatus, allowedFrom, closesEncounter, leavingDisposition, transitionProblem } from './tasks.rules';

type At = { organizationId: string; branchId: string };
type Task = { id: string; status: TaskStatus; encounterId: string; patientId: string; queueId: string };
type LockedEncounter = { firstSeenAt: Date | null };

const TASK_SELECT = { id: true, status: true, encounterId: true, patientId: true, queueId: true } as const;

@Injectable()
export class TasksService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly tasks: TaskFactory,
    ) {}

    /** Calls the patient for this task (again, if they didn't come). */
    async call(taskId: string, at: At, user: AuthUser) {
        const task = await this.ownTask(taskId, at, user, 'call');
        return this.move(task, 'call', {
            status:    $Enums.QueueEntryStatus.CALLED,
            calledAt:  new Date(),
            calledBy:  user.sub,
            callCount: { increment: 1 },
        });
    }

    /** Starts attending to the patient. The first start of the visit is when a clinician first saw them. */
    async start(taskId: string, at: At, user: AuthUser) {
        const task = await this.ownTask(taskId, at, user, 'start');
        const now = new Date();
        return this.databaseService.transaction(async () => {
            const started = await this.move(task, 'start', { status: $Enums.QueueEntryStatus.IN_SERVICE, startedAt: now, servedBy: user.sub });
            await this.markFirstSeen(task.encounterId, now);
            return started;
        });
    }

    /**
     * Finishes this station's task (11 §5.7, §14). With `nextQueueId` the patient goes on to that
     * station's list; without it, if no other station still has a task for them, the encounter
     * closes here. The encounter row is locked first, so two stations finishing at the same moment
     * can't both think the other is still working.
     */
    async complete(taskId: string, dto: CompleteTaskDto, at: At, user: AuthUser) {
        const task = await this.ownTask(taskId, at, user, 'complete');
        const now = new Date();

        const [nextQueue] = dto.nextQueueId ? await this.tasks.loadQueues([dto.nextQueueId]) : [];
        if (dto.nextQueueId && !nextQueue) throw new NotFoundException('Next queue not found or not active');

        return this.databaseService.transaction(async () => {
            await this.lockEncounter(task.encounterId);

            const completed = await this.move(task, 'complete', {
                status:      $Enums.QueueEntryStatus.COMPLETED,
                completedAt: now,
                servedBy:    user.sub,
                outcomeNote: dto.note,
            });
            await this.markFirstSeen(task.encounterId, now);

            if (nextQueue) {
                // A doctors' task waits for payment when the hospital collects first (11 §6)
                const next = await this.tasks.create({
                    encounterId: task.encounterId,
                    patientId:   task.patientId,
                    branchId:    at.branchId,
                    queue:       nextQueue,
                    fromEntryId: task.id,
                    by:          user.sub,
                    now,
                });
                return { task: completed, next, encounterClosed: false };
            }

            const encounterClosed = await this.closeIfLastTask(task, user.sub, now);
            return { task: completed, next: null, encounterClosed };
        });
    }

    /**
     * Cancels a task with a reason: the service isn't needed after all, or the patient left
     * (11 §14.2). Staff following up unfinished visits (`encounter.follow_up`) can cancel tasks on
     * any queue at their branch, since the patient's tasks are rarely on their own lists. If it was
     * the last task, the encounter closes; for a patient who left, with the matching disposition.
     */
    async cancel(taskId: string, dto: CancelTaskDto, at: At, user: AuthUser) {
        const task = await this.ownTask(taskId, at, user, 'cancel', user.permissions.includes('encounter.follow_up'));
        const now = new Date();

        return this.databaseService.transaction(async () => {
            const encounter = await this.lockEncounter(task.encounterId);
            const cancelled = await this.move(task, 'cancel', {
                status:      $Enums.QueueEntryStatus.CANCELLED,
                completedAt: now,
                servedBy:    user.sub,
                outcomeNote: dto.reason,
            });

            const disposition = dto.patientLeft ? leavingDisposition(encounter.firstSeenAt) : null;
            const encounterClosed = await this.closeIfLastTask(task, user.sub, now, disposition && {
                disposition,
                dispositionAt:   now,
                dispositionBy:   user.sub,
                dispositionNote: dto.reason,
            });
            return { task: cancelled, encounterClosed, disposition: encounterClosed ? disposition : null };
        });
    }

    /**
     * The task, if it's at the caller's branch and on one of their duty profiles' queues (05 §7),
     * else 404, so tasks elsewhere aren't revealed. Then 409 if the action doesn't fit its status.
     */
    private async ownTask(taskId: string, at: At, user: AuthUser, action: TaskAction, anyQueueAtBranch = false): Promise<Task> {
        const task = await this.databaseService.client.queueEntry.findFirst({
            where: {
                id: taskId,
                branchId: at.branchId,
                ...(!anyQueueAtBranch && { queue: { dutyProfileQueues: { some: { dutyProfileId: { in: user.dutyProfileIds } } } } }),
            },
            select: TASK_SELECT,
        });
        if (!task) throw new NotFoundException('Task not found on your queues');

        const problem = transitionProblem(task.status, action);
        if (problem) throw new ConflictException(problem);
        return task;
    }

    /** Applies a status change only if the task is still in a status the action allows (it may have moved meanwhile). */
    private async move(task: Task, action: TaskAction, data: Prisma.QueueEntryUpdateInput) {
        try {
            return await this.databaseService.client.queueEntry.update({
                where:  { id: task.id, status: { in: allowedFrom(action) } },
                data,
                select: { id: true, status: true, ticketNumber: true, calledAt: true, callCount: true, startedAt: true, completedAt: true },
            });
        } catch (e) {
            if (isRecordNotFound(e)) throw new ConflictException('This task was changed by someone else; refresh the list');
            throw e;
        }
    }

    /** Locks the encounter row for the rest of the transaction, with what finishing a task needs. */
    private async lockEncounter(encounterId: string): Promise<LockedEncounter> {
        const [row] = await this.databaseService.client.$queryRaw<LockedEncounter[]>`
            SELECT "firstSeenAt" FROM "Encounter" WHERE "id" = ${encounterId} FOR UPDATE`;
        return row;
    }

    /** Closes the encounter when no other station still has a task for the patient (11 §14). */
    private async closeIfLastTask(task: Task, by: string, now: Date, extra?: Prisma.EncounterUpdateInput | null): Promise<boolean> {
        const client = this.databaseService.client;
        const otherActive = await client.queueEntry.count({
            where: { encounterId: task.encounterId, status: { in: [...ACTIVE_TASK] } },
        });
        if (!closesEncounter(otherActive)) return false;

        await client.encounter.update({
            where: { id: task.encounterId },
            data:  {
                status:          $Enums.EncounterStatus.CLOSED,
                closedAt:        now,
                closedBy:        by,
                closedAtQueueId: task.queueId,
                ...extra,
            },
        });
        return true;
    }

    private markFirstSeen(encounterId: string, now: Date) {
        return this.databaseService.client.encounter.updateMany({
            where: { id: encounterId, firstSeenAt: null },
            data:  { firstSeenAt: now },
        });
    }
}
