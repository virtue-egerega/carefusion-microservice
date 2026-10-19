import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CancelTaskDto, CompleteTaskDto } from '@shared/contracts/encounters';
import { Authorize, BranchId, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { TasksService } from './tasks.service';

// A queue entry is one station's task for the patient (11 §5). Only tasks on your duty profiles' queues.
@ApiTags('queue-entries')
@Controller('queue-entries')
export class TasksController {
    constructor(private readonly tasksService: TasksService) {}

    @ApiOperation({ summary: 'Call the patient for this task (again, if they did not come)' })
    @Authorize('queue.call')
    @Post(':id/call')
    call(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() organizationId: string, @BranchId() branchId: string, @CurrentUser() user: AuthUser) {
        return this.tasksService.call(id, { organizationId, branchId }, user);
    }

    @ApiOperation({ summary: 'Start attending to the patient' })
    @Authorize('queue.call')
    @Post(':id/start')
    start(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() organizationId: string, @BranchId() branchId: string, @CurrentUser() user: AuthUser) {
        return this.tasksService.start(id, { organizationId, branchId }, user);
    }

    @ApiOperation({
        summary: "Finish this station's task, and send the patient on (nextQueueId) or let them go",
        description: 'Without nextQueueId, the encounter closes if no other station still has a task for the patient (encounterClosed in the response).',
    })
    @Authorize('queue.call')
    @Post(':id/complete')
    complete(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CompleteTaskDto,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.tasksService.complete(id, dto, { organizationId, branchId }, user);
    }

    @ApiOperation({
        summary: 'Cancel a task with a reason: not needed, or the patient left (patientLeft)',
        description: 'With encounter.follow_up, any task at your branch (following up unfinished visits). Closes the encounter if it was the last task.',
    })
    @Authorize('queue.manage')
    @Post(':id/cancel')
    cancel(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CancelTaskDto,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.tasksService.cancel(id, dto, { organizationId, branchId }, user);
    }
}
