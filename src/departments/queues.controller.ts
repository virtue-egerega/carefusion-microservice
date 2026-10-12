import { Body, Controller, Param, Patch } from '@nestjs/common';
import { DepartmentsService, UpdateQueueDto } from './departments.service';

@Controller('queues')
export class QueuesController {
    constructor(private readonly departmentsService: DepartmentsService) {}

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateQueueDto) {
        return this.departmentsService.updateQueue(id, dto);
    }
}
