import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
    constructor(private readonly accessControlService: AccessControlService) {}

    @ApiOperation({ summary: 'List all platform permissions grouped by category' })
    @Get()
    findAll(
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
    ) {
        return this.accessControlService.getPermissionsGrouped(limit, offset, search);
    }
}
