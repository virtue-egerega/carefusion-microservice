import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
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

    @Get(':id/queues')
    findQueues(@Param('id') id: string) {
        return this.departmentsService.findQueues(id);
    }
}
