import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { DatabaseService } from '../database/database.service';

/** What can be uploaded for now: photos and scans of paperwork. */
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 10;

/** A file as multer hands it over (memory storage). */
export type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const fileSelect = { id: true, fileName: true, mimeType: true, sizeBytes: true, url: true, uploadedAt: true };

/**
 * The central file store: a file is uploaded once, gets an id, and features link to it by id (a goods
 * receipt's invoice photos). For now the bytes sit on this server's disk under FILE_STORAGE_ROOT (default:
 * a `files` folder beside the project) and are served by GET /files/:id/content. How files are stored is
 * to be redefined (15 §24); only this service knows. Scoped to the caller's organisation.
 */
@Injectable()
export class FilesService {
    private readonly root: string;

    constructor(
        private readonly databaseService: DatabaseService,
        config: ConfigService,
    ) {
        this.root = config.get<string>('FILE_STORAGE_ROOT') ?? join(process.cwd(), '..', 'files');
    }

    /**
     * Stores the files and returns them in the order given. A file the organisation already has (same
     * content) isn't stored again: its existing stored file is returned.
     */
    async upload(files: UploadedFile[] | undefined, organizationId: string, uploadedBy: string) {
        if (!files?.length) throw new BadRequestException('Attach one or more files as `files`');
        const wrong = files.filter(f => !UPLOAD_TYPES.includes(f.mimetype)).map(f => f.originalname);
        if (wrong.length) throw new BadRequestException(`Only JPEG, PNG or PDF: ${wrong.join(', ')}`);

        const client = this.databaseService.client;
        const hashed = files.map(file => ({ file, sha256: createHash('sha256').update(file.buffer).digest('hex') }));
        const existing = await client.storedFile.findMany({
            where:  { organizationId, sha256: { in: hashed.map(h => h.sha256) } },
            select: { ...fileSelect, sha256: true },
        });

        const stored = new Map(existing.map(f => [f.sha256, f]));
        for (const { file, sha256 } of hashed) {
            if (stored.has(sha256)) continue;   // also a file given twice in the same upload
            const id = randomUUID();
            const storageKey = `${organizationId}/${id}${extname(file.originalname).toLowerCase()}`;
            await mkdir(join(this.root, organizationId), { recursive: true });
            await writeFile(join(this.root, storageKey), file.buffer);

            const created = await client.storedFile.upsert({
                // another upload of the same file may have landed meanwhile: the unique index decides
                where:  { organizationId_sha256: { organizationId, sha256 } },
                create: {
                    id, organizationId, sha256, uploadedBy, storageKey,
                    url:       `/api/v1/files/${id}/content`,
                    fileName:  file.originalname,
                    mimeType:  file.mimetype,
                    sizeBytes: file.size,
                },
                update: {},
                select: { ...fileSelect, sha256: true },
            });
            // it did: the copy just written isn't needed
            if (created.id !== id) await unlink(join(this.root, storageKey)).catch(() => undefined);
            stored.set(sha256, created);
        }

        const docs = hashed.map(({ sha256 }) => {
            const { sha256: _, ...file } = stored.get(sha256)!;
            return file;
        });
        return { count: docs.length, docs };
    }

    async findOne(storedFileId: string, organizationId: string) {
        const file = await this.databaseService.client.storedFile.findFirst({ where: { id: storedFileId, organizationId }, select: fileSelect });
        if (!file) throw new NotFoundException('File not found');
        return file;
    }

    /** The file's bytes, to view in the browser or download. */
    async content(storedFileId: string, organizationId: string) {
        const file = await this.databaseService.client.storedFile.findFirst({
            where:  { id: storedFileId, organizationId },
            select: { storageKey: true, fileName: true, mimeType: true, sizeBytes: true },
        });
        if (!file) throw new NotFoundException('File not found');

        return new StreamableFile(createReadStream(join(this.root, file.storageKey)), {
            type:        file.mimeType,
            length:      file.sizeBytes,
            disposition: `inline; filename="${file.fileName.replace(/"/g, '')}"`,
        });
    }

    /** Every id must be one of the organisation's stored files; a 404 names the ones that aren't. */
    async assertOwned(storedFileIds: string[], organizationId: string) {
        if (!storedFileIds.length) return;
        const found = await this.databaseService.client.storedFile.findMany({
            where:  { id: { in: storedFileIds }, organizationId },
            select: { id: true },
        });
        const known = new Set(found.map(f => f.id));
        const missing = storedFileIds.filter(id => !known.has(id));
        if (missing.length) throw new NotFoundException(`File(s) not found: ${missing.join(', ')}`);
    }
}
