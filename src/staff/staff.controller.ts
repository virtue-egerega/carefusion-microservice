import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto } from '@shared/contracts/staff/create-staff.dto';
import { UpdateStaffDto } from '@shared/contracts/staff/update-staff.dto';
import { Authorize, CurrentUser, OrganizationId } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
    constructor(private readonly staffService: StaffService) {}

    @ApiOperation({ summary: 'Create a staff account. The response carries a one-time temporaryPassword; it is never shown again' })
    @Authorize('staff.manage')
    @Post()
    create(@Body() dto: CreateStaffDto, @OrganizationId() organizationId: string, @CurrentUser() user: AuthUser) {
        return this.staffService.create(dto, { organizationId, branchId: user.branchId }, user.sub);
    }

    @ApiOperation({ summary: 'Issue a new temporary password (shown once); the staff member must change it at next login' })
    @Authorize('staff.password.reset')
    @Post(':id/reset-password')
    resetPassword(@Param('id') id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.staffService.resetPassword(id, orgId, user.sub);
    }

    @ApiOperation({ summary: 'List all staff — paginated with optional search' })
    @Authorize('staff.manage')
    @Get()
    findAll(
        @OrganizationId() orgId: string,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
    ) {
        return this.staffService.findAll(orgId, limit, offset, search);
    }

    @ApiOperation({ summary: 'Get a single staff member with department and active duty profile assignments' })
    @Authorize('staff.manage')
    @Get(':id')
    findOne(@Param('id') id: string, @OrganizationId() orgId: string) {
        return this.staffService.findOne(id, orgId);
    }

    @ApiOperation({ summary: 'Update staff — name, phone, role, department, status' })
    @Authorize('staff.manage')
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateStaffDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.staffService.update(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Soft-delete a staff member' })
    @Authorize('staff.manage')
    @Delete(':id')
    remove(@Param('id') id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.staffService.remove(id, orgId, user.sub);
    }
}
