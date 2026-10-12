import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto } from '@shared/contracts/staff/create-staff.dto';
import { UpdateStaffDto } from '@shared/contracts/staff/update-staff.dto';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
    constructor(private readonly staffService: StaffService) {}

    @ApiOperation({ summary: 'Create a staff account (status = NOTAPPROVED until activated)' })
    @Post()
    create(@Body() dto: CreateStaffDto) {
        return this.staffService.create(dto);
    }

    @ApiOperation({ summary: 'List all staff — paginated with optional search' })
    @Get()
    findAll(
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
    ) {
        return this.staffService.findAll(limit, offset, search);
    }

    @ApiOperation({ summary: 'Get a single staff member with department and active duty profile assignments' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.staffService.findOne(id);
    }

    @ApiOperation({ summary: 'Update staff — name, phone, role, department, status' })
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
        return this.staffService.update(id, dto);
    }

    @ApiOperation({ summary: 'Soft-delete a staff member' })
    @Delete(':id')
    remove(@Param('id') id: string, @Query('deletedBy') deletedBy: string) {
        return this.staffService.remove(id, deletedBy);
    }
}
