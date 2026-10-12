import { Body, Controller, Delete, Get, Param, Patch, Post, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DutyProfileService } from './duty-profile.service';
import {
    CreateDutyProfileDto,
    UpdateDutyProfileDto,
    ManageQueuesDto,
    ManagePermissionsDto,
    AssignDutyProfileDto,
} from '@shared/contracts/access-control';

@ApiTags('duty-profiles')
@Controller('duty-profiles')
export class DutyProfileController {
    constructor(private readonly dutyProfileService: DutyProfileService) {}

    @ApiOperation({ summary: 'Create a duty profile with optional queues and permissions' })
    @Post()
    create(@Body() dto: CreateDutyProfileDto) {
        return this.dutyProfileService.create(dto);
    }

    @ApiOperation({ summary: 'List all duty profiles' })
    @Get()
    findAll(
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
    ) {
        return this.dutyProfileService.findAll(limit, offset, search);
    }

    @ApiOperation({ summary: 'Get a single duty profile' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.dutyProfileService.findOne(id);
    }

    @ApiOperation({ summary: 'Update name or department of a duty profile' })
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateDutyProfileDto) {
        return this.dutyProfileService.update(id, dto);
    }

    @ApiOperation({ summary: 'Soft-delete a duty profile' })
    @Delete(':id')
    remove(@Param('id') id: string, @Query('deletedBy') deletedBy: string) {
        return this.dutyProfileService.remove(id, deletedBy);
    }

    // ── Queues ──────────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Add queues to a duty profile' })
    @Post(':id/queues')
    addQueues(@Param('id') id: string, @Body() dto: ManageQueuesDto) {
        return this.dutyProfileService.addQueues(id, dto);
    }

    @ApiOperation({ summary: 'Remove a queue from a duty profile' })
    @Delete(':id/queues/:queueId')
    removeQueue(@Param('id') id: string, @Param('queueId') queueId: string) {
        return this.dutyProfileService.removeQueue(id, queueId);
    }

    // ── Permissions ─────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Add permissions to a duty profile' })
    @Post(':id/permissions')
    addPermissions(@Param('id') id: string, @Body() dto: ManagePermissionsDto) {
        return this.dutyProfileService.addPermissions(id, dto);
    }

    @ApiOperation({ summary: 'Remove a permission from a duty profile' })
    @Delete(':id/permissions/:permissionId')
    removePermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
        return this.dutyProfileService.removePermission(id, permissionId);
    }

    // ── Staff assignment ─────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Assign a duty profile to a staff member' })
    @Post('staff/:staffId/assign')
    assignToStaff(
        @Param('staffId') staffId: string,
        @Body() dto: AssignDutyProfileDto,
        @Query('assignedBy') assignedBy: string,
    ) {
        return this.dutyProfileService.assignToStaff(staffId, dto, assignedBy);
    }

    @ApiOperation({ summary: 'Remove a duty profile from a staff member' })
    @Delete('staff/:staffId/assign/:dutyProfileId')
    unassignFromStaff(
        @Param('staffId') staffId: string,
        @Param('dutyProfileId') dutyProfileId: string,
    ) {
        return this.dutyProfileService.unassignFromStaff(staffId, dutyProfileId);
    }

    @ApiOperation({ summary: "List a staff member's duty profile assignments" })
    @Get('staff/:staffId/assignments')
    getStaffAssignments(@Param('staffId') staffId: string) {
        return this.dutyProfileService.getStaffAssignments(staffId);
    }
}
