import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { GROUP_PAGE_MAX } from './permissions.rules';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
    constructor(private readonly accessControlService: AccessControlService) {}

    @ApiOperation({
        summary: 'List platform permissions grouped by category, paged by group',
        description: `limit, offset and count all count groups (max ${GROUP_PAGE_MAX} per page); a group is never split across pages. search keeps only matching permissions and drops groups with none; group narrows to one category (e.g. billing).`,
    })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'group', required: false })
    @Get()
    findAll(
        @Query('limit', new DefaultValuePipe(GROUP_PAGE_MAX), ParseIntPipe) limit: number,
        @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
        @Query('search') search?: string,
        @Query('group') group?: string,
    ) {
        return this.accessControlService.getPermissionsGrouped(limit, offset, search, group);
    }
}
