import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, BranchId, CurrentUser } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { WorklistsService } from './worklists.service';

@ApiTags('queues')
@Controller('queues')
export class WorklistsController {
    constructor(private readonly worklistsService: WorklistsService) {}

    @ApiOperation({
        summary: "A queue's live worklist at your branch (e.g. a nursing station's waiting room)",
        description: "Active entries, highest priority first, then longest waiting. HELD entries are waiting for payment. 403 unless one of your duty profiles includes the queue.",
    })
    @Authorize('queue.view')
    @Get(':id/entries')
    worklist(
        @Param('id', ParseUUIDPipe) id: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.worklistsService.worklist(id, branchId, user.dutyProfileIds);
    }
}
