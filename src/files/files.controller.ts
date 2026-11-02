import { Controller, Get, Param, ParseUUIDPipe, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';
import { FilesService, UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES, UploadedFile } from './files.service';

/** The central file store: upload first, then link the returned ids where they belong. */
@ApiTags('files')
@Controller('files')
export class FilesController {
    constructor(private readonly filesService: FilesService) {}

    @ApiOperation({
        summary: `Upload one or more files`,
        description: `JPEG, PNG or PDF, up to ${UPLOAD_MAX_FILES} files of ${UPLOAD_MAX_BYTES / 1024 / 1024} MB each, as \`files\`. Returns \`{ count, docs }\` in the ` +
        `order sent, each with its \`id\` to link elsewhere (e.g. a goods receipt's \`attachmentFileIds\`). A file already stored is returned, not stored again.`,
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
    @Authorize()
    @UseInterceptors(FilesInterceptor('files', UPLOAD_MAX_FILES, { limits: { fileSize: UPLOAD_MAX_BYTES } }))
    @Post()
    upload(@UploadedFiles() files: UploadedFile[] | undefined, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.filesService.upload(files, orgId, user.sub);
    }

    @ApiOperation({
        summary: `A stored file's content`,
        description: `The file itself, to view in the browser or download (the \`url\` a stored file carries).`,
    })
    @Authorize()
    @Get(':id/content')
    content(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.filesService.content(id, orgId);
    }

    @ApiOperation({ summary: `A stored file's details` })
    @Authorize()
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.filesService.findOne(id, orgId);
    }
}
