import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Hands out each organisation's sequential patient numbers from memory, so registering a patient
 * never reads the database for its number (06 §3).
 *
 * - Loaded once at boot (highest number per organisation), before the API takes requests.
 * - `next()` is synchronous: read-and-increment can't interleave with another request, because
 *   Node only switches requests at an `await`. Two concurrent registrations always get different numbers.
 * - A registration that fails after taking a number leaves a gap. Numbers carry no meaning beyond
 *   identifying the patient (createdAt records order), so gaps are harmless and never refilled.
 * - The unique (hospitalId, patientNumber) index is the backstop if a second process ever writes:
 *   the caller retries and `next()` simply moves past the taken number.
 */
@Injectable()
export class PatientNumbers implements OnModuleInit {
    private readonly logger = new Logger(PatientNumbers.name);
    private readonly last = new Map<string, number>();

    constructor(private readonly databaseService: DatabaseService) {}

    async onModuleInit() {
        const rows = await this.databaseService.client.patient.groupBy({
            by: ['hospitalId'],
            _max: { patientNumber: true },
        });
        for (const row of rows) this.last.set(row.hospitalId, row._max.patientNumber ?? 0);
        this.logger.log(`Patient numbers loaded for ${rows.length} organisation(s)`);
    }

    /**
     * The organisation's next patient number: one past the last handed out, but never below the
     * organisation's patientNumberStart (passed in from the organisation read registration already does).
     */
    next(organizationId: string, start: number): number {
        const n = Math.max((this.last.get(organizationId) ?? 0) + 1, start);
        this.last.set(organizationId, n);
        return n;
    }
}
