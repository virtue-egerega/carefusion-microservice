import { Controller, Get, ParseUUIDPipe, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { QueueManagementService } from './queue-management.service';
import { UpdateQueueManagementDto } from './dto/update-queue-management.dto';
import { WorklistQueryDto } from './dto/worklist-query.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, BranchId, CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';

@Controller('queues')
export class QueueManagementController {
  constructor(private readonly queueManagementService: QueueManagementService) {}

  @ApiOperation({
      summary: 'Your queues (from your duty profiles) with the number of patients on each list at your branch',
      description: 'patients: { total, waiting, held (awaiting payment), called, inService } per queue. Queues with nobody on them show zeros.',
  })
  @Authorize()
  @Get('mine')
  mine(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
      return this.queueManagementService.mine(branchId, user.dutyProfileIds);
  }

  @ApiOperation({
      summary: "A queue's live worklist at your branch (e.g. a nursing station's waiting room)",
      description: "Active entries, highest priority first; within a priority, AWAITING_SERVICE (paid, service resumes) before the rest, then longest waiting. HELD entries are waiting for payment. Filter by status and search by name, ticket or patient number, or encounter code; `patients` always counts the whole list, for status tabs. 403 unless one of your duty profiles includes the queue.",
  })
  @Authorize()
  @Get(':id/entries')
  worklist(
      @Param('id', ParseUUIDPipe) id: string,
      @Query() query: WorklistQueryDto,
      @BranchId() branchId: string,
      @CurrentUser() user: AuthUser,
  ) {
      return this.queueManagementService.worklist(id, branchId, user.dutyProfileIds, query);
  }

}
