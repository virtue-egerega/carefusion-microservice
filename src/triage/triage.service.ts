import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { withConstraintErrors } from '../database/prisma-errors';
import { $Enums } from '../../generated/prisma/client';
import { CorrectVitalsDto, RecordTriageDto, RecordVitalsDto, VitalsQueryDto } from '@shared/contracts/triage';
import { loadActors } from '../billables/actors';
import { ACTIVE_TASK } from '../encounters/tasks/tasks.rules';
import { correctedReading, retriageProblem, vitalsProblem } from './rules/triage.rules';

const VITALS_SELECT = {
    id: true, context: true, takenAt: true, notes: true,
    temperature: true, pulse: true, respiratoryRate: true, systolic: true, diastolic: true, spo2: true,
    painScore: true, bloodGlucose: true, weight: true, height: true,
    replacesId: true, editReason: true, removedAt: true, removedBy: true, removeReason: true,
    recordedBy: true, recordedAt: true,
    replacedBy: { select: { id: true } },
} as const;

/** Triage and vital signs (PRD 11 §8–9). Every read and write is scoped to the caller's organisation. */
@Injectable()
export class TriageService {
    constructor(private readonly databaseService: DatabaseService) {}

    // ── Vitals ───────────────────────────────────────────────────────────────

    /** Records one reading on an open encounter (11 §9). */
    async recordVitals(encounterId: string, dto: RecordVitalsDto, organizationId: string, recordedBy: string) {
        await this.openEncounter(encounterId, organizationId);
        const problem = vitalsProblem(dto);
        if (problem) throw new BadRequestException(problem);
        
        const { id } = await this.databaseService.client.vitals.create({
            data:   { ...dto, takenAt: new Date(), context: dto.context as $Enums.VitalsContext | undefined, encounterId, recordedBy },
            select: { id: true },
        });
        return { id, message: 'Vital signs recorded' };
    }

    /**
     * Corrects a reading by saving the corrected one as a new reading that replaces it (11 §9); the
     * original stays on record. A removed or already-replaced reading can't be corrected; two
     * corrections of the same reading at once can't both land (`replacesId` is unique).
     */
    async correctVitals(vitalsId: string, dto: CorrectVitalsDto, organizationId: string, recordedBy: string) {
        const client = this.databaseService.client;
        const old = await client.vitals.findFirst({
            where:  { id: vitalsId, encounter: { organizationId } },
            select: { ...VITALS_SELECT, encounterId: true, encounter: { select: { arrivedAt: true } } },
        });
        if (!old) throw new NotFoundException('Reading not found');
        if (old.removedAt) throw new ConflictException('This reading was removed');
        if (old.replacedBy) throw new ConflictException('This reading was already corrected. Correct the latest one');

        const { editReason, ...changes } = dto;
        const reading = correctedReading(old, changes);
        const problem = vitalsProblem(reading);
        if (problem) throw new BadRequestException(problem);

        const { id } = await withConstraintErrors(
            () => client.vitals.create({
                data: {
                    takenAt: new Date(),
                    encounterId: old.encounterId,
                    context:     old.context,
                    ...reading,
                    replacesId:  old.id,
                    editReason,
                    recordedBy,
                } as Parameters<typeof client.vitals.create>[0]['data'],
                select: { id: true },
            }),
            { conflict: 'This reading was just corrected by someone else. Refresh and try again' },
        );
        return { id, message: 'Reading corrected' };
    }

    /** Marks a reading removed, with who and why; it stays on record, struck through (11 §9). */
    async removeVitals(vitalsId: string, reason: string, organizationId: string, removedBy: string) {
        const client = this.databaseService.client;
        const { count } = await client.vitals.updateMany({
            where: { id: vitalsId, encounter: { organizationId }, removedAt: null, replacedBy: null },
            data:  { removedAt: new Date(), removedBy, removeReason: reason },
        });
        if (count) return { message: 'Reading removed' };

        // only when nothing matched: say why
        const found = await client.vitals.findFirst({
            where:  { id: vitalsId, encounter: { organizationId } },
            select: { removedAt: true },
        });
        if (!found) throw new NotFoundException('Reading not found');
        throw new ConflictException(found.removedAt ? 'This reading was already removed' : 'This reading was corrected. Remove the latest one');
    }

    /**
     * An encounter's readings by when they were taken, newest first: `{ count, docs }`. Removed readings
     * are shown (struck through) unless `includeRemoved` is false; readings a correction replaced are
     * hidden unless `includeReplaced`. The recorders and removers are resolved to people.
     */
    async listVitals(encounterId: string, query: VitalsQueryDto, organizationId: string) {
        const client = this.databaseService.client;
        const where = {
            encounterId,
            encounter: { organizationId },
            ...(query.context && { context: query.context as $Enums.VitalsContext }),
            ...((query.from || query.to) && { takenAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } }),
            ...(!query.includeRemoved && { removedAt: null }),
            ...(!query.includeReplaced && { replacedBy: null }),
        };

        const [encounter, count, readings] = await client.$transaction([
            client.encounter.findFirst({ where: { id: encounterId, organizationId }, select: { id: true } }),
            client.vitals.count({ where }),
            client.vitals.findMany({ where, take: query.limit, skip: query.offset, orderBy: { takenAt: 'desc' }, select: VITALS_SELECT }),
        ]);
        if (!encounter) throw new NotFoundException('Encounter not found');

        const people = await loadActors(this.databaseService, readings.flatMap(r => [r.recordedBy, r.removedBy]));
        return {
            count,
            docs: readings.map(({ replacedBy, recordedBy, removedBy, ...reading }) => ({
                ...reading,
                recordedBy: people.get(recordedBy) ?? null,
                removedBy:  removedBy ? people.get(removedBy) ?? null : null,
                replacedBy: replacedBy?.id ?? null,
            })),
        };
    }

    // ── Triage assessment ────────────────────────────────────────────────────

    /**
     * Records the encounter's triage, or re-triages it (11 §8.1): a new version replacing the current
     * one, which stays on record. The presenting complaint becomes the encounter's reason for visit,
     * and the priority goes on the encounter and its active tasks, so the doctors' list orders by it.
     */
    async recordTriage(encounterId: string, dto: RecordTriageDto, organizationId: string, triagedBy: string) {
        return withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const client = this.databaseService.client;
                await this.openEncounter(encounterId, organizationId);
                const current = await client.triageAssessment.findFirst({ where: { encounterId, replacedBy: null }, select: { id: true } });
                const problem = retriageProblem(!!current, dto.changeReason);
                if (problem) throw new BadRequestException(problem);

                const priority = dto.priority as $Enums.QueuePriority;
                const { id } = await client.triageAssessment.create({
                    data: {
                        encounterId,
                        presentingComplaint: dto.presentingComplaint.trim(),
                        onset:               dto.onset,
                        painLocation:        dto.painLocation,
                        avpu:                dto.avpu as $Enums.Avpu,
                        dangerSigns:         (dto.dangerSigns ?? []) as $Enums.DangerSign[],
                        priority,
                        suggestedPriority:   dto.suggestedPriority as $Enums.QueuePriority | undefined,
                        replacesId:          current?.id,
                        changeReason:        current ? dto.changeReason!.trim() : null,
                        triagedBy,
                    },
                    select: { id: true },
                });
                await client.encounter.update({
                    where: { id: encounterId },
                    data:  { reasonForVisit: dto.presentingComplaint.trim(), triagePriority: priority },
                });
                await client.queueEntry.updateMany({
                    where: { encounterId, status: { in: [...ACTIVE_TASK] } },
                    data:  { priority, priorityReason: 'Triage' },
                });
                return { id, message: current ? 'Patient re-triaged' : 'Triage recorded' };
            }),
            { conflict: 'This patient was just re-triaged by someone else. Refresh and try again' },
        );
    }

    /** The encounter's current assessment and its earlier versions, newest first, with who triaged each. */
    async getTriage(encounterId: string, organizationId: string) {
        const client = this.databaseService.client;
        const [encounter, versions] = await client.$transaction([
            client.encounter.findFirst({ where: { id: encounterId, organizationId }, select: { id: true } }),
            client.triageAssessment.findMany({ where: { encounterId }, orderBy: { triagedAt: 'desc' } }),
        ]);
        if (!encounter) throw new NotFoundException('Encounter not found');

        const people = await loadActors(this.databaseService, versions.map(v => v.triagedBy));
        const [current, ...history] = versions.map(({ triagedBy, ...version }) => ({ ...version, triagedBy: people.get(triagedBy) ?? null }));
        return { current: current ?? null, history };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** The encounter, if it's the organisation's and still open: triage is recorded during the visit. */
    private async openEncounter(encounterId: string, organizationId: string) {
        const encounter = await this.databaseService.client.encounter.findFirst({
            where:  { id: encounterId, organizationId },
            select: { status: true, arrivedAt: true },
        });
        if (!encounter) throw new NotFoundException('Encounter not found');
        if (encounter.status !== $Enums.EncounterStatus.OPEN) throw new ConflictException('This encounter is closed');
        return encounter;
    }
}

