import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DepartmentsService, UpdateQueueDto } from './departments.service';
import { GROUP_PAGE_MAX } from '../access-control/permissions.rules';

@Controller('queues')
export class QueuesController {
    constructor(private readonly departmentsService: DepartmentsService) {}

    @ApiOperation({
        summary: 'Queue picker for duty profiles (access queues and send queues), grouped by department',
        description: `Only active queues are listed, since only they can be linked to a duty profile. limit, offset and count all count departments (max ${GROUP_PAGE_MAX} per page); a department is never split across pages. search matches queue or department names and drops departments with no match; departmentId narrows to one department.`,
    })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'departmentId', required: false })
    @Get()
    findPicker(
        @Query('limit', new DefaultValuePipe(GROUP_PAGE_MAX), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
        @Query('departmentId') departmentId?: string,
    ) {
        return this.departmentsService.findQueuePicker(limit, offset, search, departmentId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateQueueDto) {
        return this.departmentsService.updateQueue(id, dto);
    }
}
