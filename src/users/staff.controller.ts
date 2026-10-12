import { Body, Controller, Param, Patch } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('staff')
export class StaffController {
    constructor(private readonly usersService: UsersService) {}

    @Patch(':id/department')
    assignDepartment(@Param('id') id: string, @Body('departmentId') departmentId: string) {
        return this.usersService.assignDepartment(id, departmentId);
    }
}
