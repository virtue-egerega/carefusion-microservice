import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { withConstraintErrors } from '../database/prisma-errors';
import { $Enums, Prisma } from '../../generated/prisma/client';
import {
    AddDiagnosisDto, ConsultationListQueryDto, DiagnosisCodeQueryDto, PatientDiagnosisQueryDto, StartConsultationDto,
    UpdateConsultationDto, UpdateDiagnosisDto,
} from '@shared/contracts/consultations';
import { loadActors } from '../billables/actors';
import {
    applicableSections, datesAndCountsProblem, diagnosisProblem, generalSignsProblem, sectionProblem, signProblem, systemListProblem,
} from './rules/consultation.rules';

/** The draft row, locked for the rest of the transaction, with what saving needs (14 §2–§7). */
type LockedNote = {
    status: string;
    doctorId: string;
    encounterId: string;
    patientId: string;
    gravida: number | null;
    parity: number | null;
    abortions: number | null;
    lastMenstrualPeriod: Date | null;
    followUpOn: Date | null;
    outcome: string | null;
    ageGroup: string | null;
    sex: string | null;
    reasonForVisit: string | null;
};

const COMPLAINTS_SELECT = { orderBy: { position: 'asc' }, select: { complaint: true, duration: true } } as const;

const LIST_SELECT = {
    id: true, type: true, status: true, startedAt: true, signedAt: true, outcome: true, doctorId: true,
    encounter: { select: { id: true, code: true } },
    clinic:    { select: { id: true, name: true } },
    complaints: COMPLAINTS_SELECT,
    diagnoses: { where: { isPrimary: true }, select: { code: true, description: true, certainty: true } },
} as const;

/** The doctor's consultation note (PRD 14). Every read and write is scoped to the caller's organisation. */
@Injectable()
export class ConsultationsService {
    constructor(private readonly databaseService: DatabaseService) {}

    // ── Starting and reading ─────────────────────────────────────────────────

    /**
     * Starts a consultation on an open encounter (14 §2), usually from the doctor's task they're serving.
     * The first complaint is the triage presenting complaint; the first consultation makes its doctor
     * the encounter's attending clinician. One note per task.
     */
    async start(encounterId: string, dto: StartConsultationDto, organizationId: string, doctorId: string) {
        return withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const client = this.databaseService.client;
                const encounter = await client.encounter.findFirst({
                    where:  { id: encounterId, organizationId },
                    select: { status: true, patientId: true, clinicId: true },
                });
                if (!encounter) throw new NotFoundException('Encounter not found');
                if (encounter.status !== $Enums.EncounterStatus.OPEN) throw new ConflictException('This encounter is closed');

                if (dto.queueEntryId) {
                    const task = await client.queueEntry.findFirst({
                        where:  { id: dto.queueEntryId, encounterId },
                        select: { status: true, servedBy: true },
                    });
                    if (!task) throw new NotFoundException("Task not found on this encounter");
                    if (task.status !== $Enums.QueueEntryStatus.IN_SERVICE || task.servedBy !== doctorId) {
                        throw new ConflictException('Start this task before writing its consultation');
                    }
                }

                const triage = await client.triageAssessment.findFirst({
                    where:  { encounterId, replacedBy: null },
                    select: { presentingComplaint: true },
                });
                const { id } = await client.consultation.create({
                    data: {
                        organizationId,
                        encounterId,
                        patientId:    encounter.patientId,
                        queueEntryId: dto.queueEntryId,
                        clinicId:     encounter.clinicId,
                        doctorId,
                        type:         dto.type as $Enums.ConsultationKind | undefined,
                        ...(triage && { complaints: { create: { complaint: triage.presentingComplaint, position: 0 } } }),
                    },
                    select: { id: true },
                });
                await client.encounter.updateMany({ where: { id: encounterId, attendingStaffId: null }, data: { attendingStaffId: doctorId } });
                return { id, message: 'Consultation started' };
            }),
            { conflict: 'A consultation was already started for this task' },
        );
    }

    /**
     * The note with everything in it, the encounter's current triage and latest vitals, and which of
     * the children's and women's sections apply (`sections`, 14 §3.8).
     */
    async findOne(id: string, organizationId: string) {
        const client = this.databaseService.client;
        const note = await client.consultation.findFirst({
            where:   { id, organizationId },
            include: {
                encounter:     { select: { id: true, code: true, ageGroup: true, arrivedAt: true } },
                patient:       { select: { sex: true } },
                clinic:        { select: { id: true, name: true } },
                complaints:    { orderBy: { position: 'asc' }, select: { complaint: true, duration: true } },
                systemReviews: { select: { system: true, normal: true, findings: true } },
                generalSigns:  { select: { sign: true, present: true, grade: true, note: true } },
                examinations:  { select: { system: true, normal: true, findings: true } },
                diagnoses:     { orderBy: [{ isPrimary: 'desc' }, { recordedAt: 'asc' }] },
                addenda:       { orderBy: { addedAt: 'asc' } },
            },
        });
        if (!note) throw new NotFoundException('Consultation not found');

        const [triage, vitals, people] = await Promise.all([
            client.triageAssessment.findFirst({ where: { encounterId: note.encounterId, replacedBy: null } }),
            client.vitals.findFirst({
                where:   { encounterId: note.encounterId, removedAt: null, replacedBy: null },
                orderBy: { takenAt: 'desc' },
            }),
            loadActors(this.databaseService, [note.doctorId, ...note.diagnoses.map(d => d.recordedBy), ...note.addenda.map(a => a.addedBy)]),
        ]);

        const { patient, encounter, doctorId, diagnoses, addenda, ...rest } = note;
        return {
            ...rest,
            encounter: { id: encounter.id, code: encounter.code, arrivedAt: encounter.arrivedAt },
            doctor:    people.get(doctorId) ?? null,
            sections:  applicableSections(encounter.ageGroup, patient.sex),
            diagnoses: diagnoses.map(({ recordedBy, ...d }) => ({ ...d, recordedBy: people.get(recordedBy) ?? null })),
            addenda:   addenda.map(({ addedBy, ...a }) => ({ ...a, addedBy: people.get(addedBy) ?? null })),
            triage,
            vitals,
        };
    }

    /** An encounter's consultations, newest first: `{ count, docs }`. */
    async listForEncounter(encounterId: string, query: ConsultationListQueryDto, organizationId: string) {
        const client = this.databaseService.client;
        const where = { ...this.listWhere(query, organizationId), encounterId };
        const [encounter, count, notes] = await client.$transaction([
            client.encounter.findFirst({ where: { id: encounterId, organizationId }, select: { id: true } }),
            client.consultation.count({ where }),
            client.consultation.findMany({ where, take: query.limit, skip: query.offset, orderBy: { startedAt: 'desc' }, select: LIST_SELECT }),
        ]);
        if (!encounter) throw new NotFoundException('Encounter not found');
        return { count, docs: await this.listDocs(notes) };
    }

    /** A patient's consultations across visits, newest first: `{ count, docs }`. */
    async listForPatient(patientId: string, query: ConsultationListQueryDto, organizationId: string) {
        const client = this.databaseService.client;
        const where = { ...this.listWhere(query, organizationId), patientId };
        const [patient, count, notes] = await client.$transaction([
            client.patient.findFirst({ where: { id: patientId, hospitalId: organizationId }, select: { id: true } }),
            client.consultation.count({ where }),
            client.consultation.findMany({ where, take: query.limit, skip: query.offset, orderBy: { startedAt: 'desc' }, select: LIST_SELECT }),
        ]);
        if (!patient) throw new NotFoundException('Patient not found');
        return { count, docs: await this.listDocs(notes) };
    }

    // ── Writing the draft ────────────────────────────────────────────────────

    /**
     * Saves the sections sent (14 §3–§6). A section left out keeps what's saved; null clears it; the
     * lists (complaints, reviews, signs, examinations) replace the saved ones. Only the author, only a draft.
     */
    async update(id: string, dto: UpdateConsultationDto, organizationId: string, userId: string) {
        const { complaints, systemReviews, generalSigns, examinations, ...fields } = dto;
        const listProblem =
            (systemReviews && systemListProblem(systemReviews, 'Review of systems')) ||
            (examinations && systemListProblem(examinations, 'Examination')) ||
            (generalSigns && generalSignsProblem(generalSigns));
        if (listProblem) throw new BadRequestException(listProblem);

        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            const note = await this.lockDraft(id, organizationId, userId);

            const problem =
                sectionProblem(fields, applicableSections(note.ageGroup, note.sex)) ??
                datesAndCountsProblem({ ...note, ...definedOnly(fields) }, new Date());
            if (problem) throw new BadRequestException(problem);

            await client.consultation.update({ where: { id }, data: fields as Prisma.ConsultationUncheckedUpdateInput });
            if (complaints !== undefined) {
                await client.consultationComplaint.deleteMany({ where: { consultationId: id } });
                await client.consultationComplaint.createMany({
                    data: (complaints ?? []).map((c, position) => ({ consultationId: id, complaint: c.complaint.trim(), duration: c.duration, position })),
                });
                // nobody triaged: the doctor's first complaint is the reason for the visit
                if (!note.reasonForVisit && complaints?.length) {
                    await client.encounter.update({ where: { id: note.encounterId }, data: { reasonForVisit: complaints[0].complaint.trim() } });
                }
            }
            if (systemReviews !== undefined) {
                await client.consultationSystemReview.deleteMany({ where: { consultationId: id } });
                await client.consultationSystemReview.createMany({ data: (systemReviews ?? []).map(r => ({ consultationId: id, ...r, system: r.system as $Enums.BodySystem })) });
            }
            if (generalSigns !== undefined) {
                await client.consultationGeneralSign.deleteMany({ where: { consultationId: id } });
                await client.consultationGeneralSign.createMany({ data: (generalSigns ?? []).map(s => ({ consultationId: id, ...s, sign: s.sign as $Enums.GeneralSign })) });
            }
            if (examinations !== undefined) {
                await client.consultationExamination.deleteMany({ where: { consultationId: id } });
                await client.consultationExamination.createMany({ data: (examinations ?? []).map(e => ({ consultationId: id, ...e, system: e.system as $Enums.BodySystem })) });
            }
            return { message: 'Consultation saved' };
        });
    }

    /** Discards the author's own draft. A signed note can't be removed. */
    async discard(id: string, organizationId: string, userId: string) {
        return this.databaseService.transaction(async () => {
            await this.lockDraft(id, organizationId, userId);
            await this.databaseService.client.consultation.delete({ where: { id } });
            return { message: 'Draft discarded' };
        });
    }

    // ── Diagnoses (14 §5) ────────────────────────────────────────────────────

    /** Adds a coded diagnosis to the author's draft. Making it primary takes primary off the one before. */
    async addDiagnosis(id: string, dto: AddDiagnosisDto, organizationId: string, userId: string) {
        const codeSystem = (dto.codeSystem ?? 'ICD_10') as $Enums.DiagnosisCodeSystem;
        const flags = { isPrimary: dto.isPrimary ?? false, certainty: dto.certainty, reported: dto.reported ?? false };
        const problem = diagnosisProblem(flags);
        if (problem) throw new BadRequestException(problem);

        const code = await this.databaseService.client.diagnosisCode.findUnique({
            where:  { codeSystem_code: { codeSystem, code: dto.code.trim().toUpperCase() } },
            select: { code: true, title: true, isActive: true },
        });
        if (!code?.isActive) throw new NotFoundException(`${dto.code} isn't an active ${codeSystem.replace('_', '-')} code`);

        return withConstraintErrors(
            () => this.databaseService.transaction(async () => {
                const client = this.databaseService.client;
                const note = await this.lockDraft(id, organizationId, userId);
                if (flags.isPrimary) await client.diagnosis.updateMany({ where: { consultationId: id, isPrimary: true }, data: { isPrimary: false } });

                const { id: diagnosisId } = await client.diagnosis.create({
                    data: {
                        consultationId: id,
                        encounterId:    note.encounterId,
                        patientId:      note.patientId,
                        codeSystem,
                        code:           code.code,
                        description:    code.title,
                        isPrimary:      flags.isPrimary,
                        certainty:      flags.certainty as $Enums.DiagnosisCertainty,
                        reported:       flags.reported,
                        note:           dto.note,
                        recordedBy:     userId,
                    },
                    select: { id: true },
                });
                return { id: diagnosisId, message: 'Diagnosis added' };
            }),
            { conflict: 'This diagnosis is already on the note' },
        );
    }

    /** Changes a diagnosis's certainty, primary flag, reported flag or note, in the author's draft. */
    async updateDiagnosis(id: string, diagnosisId: string, dto: UpdateDiagnosisDto, organizationId: string, userId: string) {
        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            await this.lockDraft(id, organizationId, userId);
            const current = await client.diagnosis.findFirst({
                where:  { id: diagnosisId, consultationId: id },
                select: { isPrimary: true, certainty: true, reported: true },
            });
            if (!current) throw new NotFoundException('Diagnosis not found on this consultation');

            const flags = { ...current, ...definedOnly({ isPrimary: dto.isPrimary, certainty: dto.certainty, reported: dto.reported }) };
            const problem = diagnosisProblem(flags);
            if (problem) throw new BadRequestException(problem);

            if (flags.isPrimary && !current.isPrimary) {
                await client.diagnosis.updateMany({ where: { consultationId: id, isPrimary: true }, data: { isPrimary: false } });
            }
            await client.diagnosis.update({
                where: { id: diagnosisId },
                data:  { isPrimary: flags.isPrimary, certainty: flags.certainty as $Enums.DiagnosisCertainty, reported: flags.reported, note: dto.note },
            });
            return { message: 'Diagnosis updated' };
        });
    }

    /** Removes a diagnosis from the author's draft. */
    async removeDiagnosis(id: string, diagnosisId: string, organizationId: string, userId: string) {
        return this.databaseService.transaction(async () => {
            await this.lockDraft(id, organizationId, userId);
            const { count } = await this.databaseService.client.diagnosis.deleteMany({ where: { id: diagnosisId, consultationId: id } });
            if (!count) throw new NotFoundException('Diagnosis not found on this consultation');
            return { message: 'Diagnosis removed' };
        });
    }

    // ── Signing and addenda (14 §7) ──────────────────────────────────────────

    /** Signs the author's draft: needs a complaint, a primary diagnosis and an outcome. The note is locked after. */
    async sign(id: string, organizationId: string, userId: string) {
        return this.databaseService.transaction(async () => {
            const client = this.databaseService.client;
            const note = await this.lockDraft(id, organizationId, userId);
            const [complaints, primary] = await Promise.all([
                client.consultationComplaint.count({ where: { consultationId: id } }),
                client.diagnosis.count({ where: { consultationId: id, isPrimary: true } }),
            ]);
            const problem = signProblem({ complaints, hasPrimary: primary > 0, outcome: note.outcome, followUpOn: note.followUpOn });
            if (problem) throw new BadRequestException(problem);

            await client.consultation.update({ where: { id }, data: { status: $Enums.ConsultationStatus.SIGNED, signedAt: new Date() } });
            return { message: 'Consultation signed' };
        });
    }

    /** Adds to a signed note, attributed to whoever adds it. A draft is edited instead. */
    async addAddendum(id: string, text: string, organizationId: string, userId: string) {
        const client = this.databaseService.client;
        const note = await client.consultation.findFirst({ where: { id, organizationId }, select: { status: true } });
        if (!note) throw new NotFoundException('Consultation not found');
        if (note.status !== $Enums.ConsultationStatus.SIGNED) throw new ConflictException('This note is still a draft: edit it instead');

        const { id: addendumId } = await client.consultationAddendum.create({
            data:   { consultationId: id, text: text.trim(), addedBy: userId },
            select: { id: true },
        });
        return { id: addendumId, message: 'Addendum added' };
    }

    // ── Past medical history and the code list ───────────────────────────────

    /**
     * The patient's past medical history (14 §3.4): each condition from their signed consultations
     * with its latest certainty, newest first: `{ count, docs }`. Differentials aren't conditions.
     */
    async patientDiagnoses(patientId: string, query: PatientDiagnosisQueryDto, organizationId: string) {
        const client = this.databaseService.client;
        const filters = [
            query.certainty ? Prisma.sql`AND "certainty" = ${query.certainty}::"DiagnosisCertainty"` : Prisma.empty,
            query.reported !== undefined ? Prisma.sql`AND "reported" = ${query.reported}` : Prisma.empty,
            query.search ? Prisma.sql`AND ("code" ILIKE ${query.search.trim() + '%'} OR "description" ILIKE ${'%' + query.search.trim() + '%'})` : Prisma.empty,
        ];
        const [patient, rows] = await Promise.all([
            client.patient.findFirst({ where: { id: patientId, hospitalId: organizationId }, select: { id: true } }),
            client.$queryRaw<(PatientCondition & { total: bigint })[]>`
                WITH latest AS (
                    SELECT DISTINCT ON (d."codeSystem", d."code")
                           d."codeSystem", d."code", d."description", d."certainty", d."reported",
                           d."recordedAt" AS "lastRecordedAt", d."consultationId", d."encounterId",
                           MIN(d."recordedAt") OVER (PARTITION BY d."codeSystem", d."code") AS "firstRecordedAt"
                      FROM "Diagnosis" d
                      JOIN "Consultation" c ON c."id" = d."consultationId"
                     WHERE d."patientId" = ${patientId} AND c."organizationId" = ${organizationId}
                       AND c."status" = 'SIGNED' AND d."certainty" <> 'DIFFERENTIAL'
                     ORDER BY d."codeSystem", d."code", d."recordedAt" DESC
                )
                SELECT *, COUNT(*) OVER () AS "total" FROM latest
                 WHERE TRUE ${Prisma.join(filters, ' ')}
                 ORDER BY "lastRecordedAt" DESC
                 LIMIT ${query.limit} OFFSET ${query.offset}`,
        ]);
        if (!patient) throw new NotFoundException('Patient not found');
        return { count: rows.length ? Number(rows[0].total) : 0, docs: rows.map(({ total, ...row }) => row) };
    }

    /** Searches the diagnosis code list by code or title: `{ count, docs }`. Active codes only. */
    async diagnosisCodes(query: DiagnosisCodeQueryDto) {
        const client = this.databaseService.client;
        const search = query.search?.trim();
        const where: Prisma.DiagnosisCodeWhereInput = {
            codeSystem: query.codeSystem as $Enums.DiagnosisCodeSystem,
            isActive:   true,
            ...(search && { OR: [{ code: { startsWith: search.toUpperCase() } }, { title: { contains: search, mode: 'insensitive' } }] }),
        };
        const [count, docs] = await client.$transaction([
            client.diagnosisCode.count({ where }),
            client.diagnosisCode.findMany({
                where, take: query.limit, skip: query.offset, orderBy: { code: 'asc' },
                select: { codeSystem: true, code: true, title: true, chapter: true },
            }),
        ]);
        return { count, docs };
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Locks the note for the rest of the transaction and checks it can be changed: it's the
     * organisation's, it's the caller's, and it's still a draft. Signing locks it the same way, so a
     * save and a sign can't interleave.
     */
    private async lockDraft(id: string, organizationId: string, userId: string): Promise<LockedNote> {
        const [note] = await this.databaseService.client.$queryRaw<LockedNote[]>`
            SELECT c."status", c."doctorId", c."encounterId", c."patientId", c."gravida", c."parity", c."abortions",
                   c."lastMenstrualPeriod", c."followUpOn", c."outcome", e."ageGroup", e."reasonForVisit", p."sex"
              FROM "Consultation" c
              JOIN "Encounter" e ON e."id" = c."encounterId"
              JOIN "Patient" p ON p."user_id" = c."patientId"
             WHERE c."id" = ${id} AND c."organizationId" = ${organizationId}
               FOR UPDATE OF c`;
        if (!note) throw new NotFoundException('Consultation not found');
        if (note.doctorId !== userId) throw new ForbiddenException('Only the doctor who wrote this note can change it');
        if (note.status !== $Enums.ConsultationStatus.DRAFT) throw new ConflictException('This note is signed: add an addendum instead');
        return note;
    }

    private listWhere(query: ConsultationListQueryDto, organizationId: string): Prisma.ConsultationWhereInput {
        const search = query.search?.trim();
        return {
            organizationId,
            ...(query.status && { status: query.status as $Enums.ConsultationStatus }),
            ...(query.type && { type: query.type as $Enums.ConsultationKind }),
            ...(query.doctorId && { doctorId: query.doctorId }),
            ...(query.clinicId && { clinicId: query.clinicId }),
            ...((query.from || query.to) && { startedAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } }),
            ...(search && {
                OR: [
                    { complaints: { some: { complaint: { contains: search, mode: 'insensitive' } } } },
                    { diagnoses: { some: { code: { startsWith: search.toUpperCase() } } } },
                    { diagnoses: { some: { description: { contains: search, mode: 'insensitive' } } } },
                ],
            }),
        };
    }

    private async listDocs<T extends { doctorId: string; diagnoses: unknown[] }>(notes: T[]) {
        const people = await loadActors(this.databaseService, notes.map(n => n.doctorId));
        return notes.map(({ doctorId, diagnoses, ...note }) => ({
            ...note,
            doctor:           people.get(doctorId) ?? null,
            primaryDiagnosis: diagnoses[0] ?? null,
        }));
    }
}

type PatientCondition = {
    codeSystem: string;
    code: string;
    description: string;
    certainty: string;
    reported: boolean;
    lastRecordedAt: Date;
    firstRecordedAt: Date;
    consultationId: string;
    encounterId: string;
};

/** The fields actually sent: a PATCH leaves out what it doesn't change. */
function definedOnly<T extends object>(fields: T): Partial<T> {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>;
}
