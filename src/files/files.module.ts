import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/** The central file store. Features import it to check the files they link to. */
@Module({
    controllers: [FilesController],
    providers:   [FilesService],
    exports:     [FilesService],
})
export class FilesModule {}
