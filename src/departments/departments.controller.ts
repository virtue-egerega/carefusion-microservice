import { Body, Controller, Get, Param, ParseBoolPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DepartmentsService, UpdateDepartmentDto } from './departments.service';

@Controller('departments')
export class DepartmentsController {
    constructor(private readonly departmentsService: DepartmentsService) {}

    @Get()
    findAll() {
        return this.departmentsService.findAll();
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
        return this.departmentsService.update(id, dto);
    }

    @ApiOperation({
        summary: "List a department's queues",
        description:
            'Returns the queues under a department, sorted by name. Pass isActive=true for the duty-profile queue picker: only active queues can be linked to a duty profile. 404s if the department does not exist or was deleted.',
    })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    @Get(':id/queues')
    findQueues(
        @Param('id') id: string,
        @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
    ) {
        return this.departmentsService.findQueues(id, isActive);
    }
}
