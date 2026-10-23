import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AddTaskDto } from '@shared/contracts/encounters';
import { Authorize, BranchId, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { SendingService } from './sending.service';

@ApiTags('queues')
@Controller()
export class SendingController {
    constructor(private readonly sendingService: SendingService) {}

    @ApiOperation({ summary: 'Queues you can send patients to (your duty profiles\' send lists): billing, nursing stations…' })
    @Authorize()
    @Get('queues/sendable')
    sendable(@CurrentUser() user: AuthUser) {
        return this.sendingService.sendable(user);
    }

    @ApiOperation({
        summary: "Put the patient on another station's list, e.g. send them to billing",
        description: 'The visit must be open. A clinic doctors\' task waits for payment when the hospital collects before consultation.',
    })
    @Authorize()
    @Post('encounters/:id/tasks')
    addTask(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AddTaskDto,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.sendingService.addTask(id, dto, { organizationId, branchId }, user);
    }
}
