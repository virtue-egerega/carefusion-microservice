import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';
import {
    AddAddendumDto, AddDiagnosisDto, ConsultationListQueryDto, DiagnosisCodeQueryDto, PatientDiagnosisQueryDto, StartConsultationDto,
    UpdateConsultationDto, UpdateDiagnosisDto,
} from '@shared/contracts/consultations';
import { ConsultationsService } from './consultations.service';

@ApiTags('consultations')
@Controller()
export class ConsultationsController {
    constructor(private readonly consultationsService: ConsultationsService) {}

    // ── The note ─────────────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Start a consultation on an open encounter (PRD 14 §2)',
        description: "Usually from the doctor's task being served (`queueEntryId`, IN_SERVICE and started by you); omit it for a " +
            'ward round. The first complaint is the triage presenting complaint. Returns `{ id, message }`. 409 closed encounter, ' +
            'task not started, or a note already started for the task.',
    })
    @Authorize('consultation.create')
    @Post('encounters/:id/consultations')
    start(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StartConsultationDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.consultationsService.start(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: "An encounter's consultations, newest first: `{ count, docs }`" })
    @Authorize('consultation.view')
    @Get('encounters/:id/consultations')
    listForEncounter(@Param('id', ParseUUIDPipe) id: string, @Query() query: ConsultationListQueryDto, @OrganizationId() orgId: string) {
        return this.consultationsService.listForEncounter(id, query, orgId);
    }

    @ApiOperation({ summary: "A patient's consultations across visits, newest first: `{ count, docs }`" })
    @Authorize('consultation.view')
    @Get('patients/:id/consultations')
    listForPatient(@Param('id', ParseUUIDPipe) id: string, @Query() query: ConsultationListQueryDto, @OrganizationId() orgId: string) {
        return this.consultationsService.listForPatient(id, query, orgId);
    }

    @ApiOperation({
        summary: 'The consultation note',
        description: "With its complaints, reviews, signs, examinations, diagnoses and addenda; the encounter's current triage and " +
            "latest vitals; and `sections: { children, women }`, which of those history sections apply to this patient.",
    })
    @Authorize('consultation.view')
    @Get('consultations/:id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.consultationsService.findOne(id, orgId);
    }

    @ApiOperation({
        summary: 'Save sections of your draft',
        description: 'Send only what changes: a field left out keeps its value, null clears it. `complaints`, `systemReviews`, ' +
            '`generalSigns` and `examinations` are whole lists that replace the saved ones. 403 not your note, 409 signed.',
    })
    @Authorize('consultation.create')
    @Patch('consultations/:id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConsultationDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.consultationsService.update(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Discard your draft. A signed note cannot be removed' })
    @Authorize('consultation.create')
    @Delete('consultations/:id')
    discard(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.consultationsService.discard(id, orgId, user.sub);
    }

    // ── Diagnoses ────────────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Add a diagnosis to your draft (PRD 14 §5)',
        description: 'An active code from GET /diagnosis-codes. Adding a primary takes primary off the previous one. ' +
            'Returns `{ id, message }`. 409 if the code is already on the note.',
    })
    @Authorize('consultation.create')
    @Post('consultations/:id/diagnoses')
    addDiagnosis(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddDiagnosisDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.consultationsService.addDiagnosis(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: "Change a diagnosis's certainty, primary flag or note, in your draft" })
    @Authorize('consultation.create')
    @Patch('consultations/:id/diagnoses/:diagnosisId')
    updateDiagnosis(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('diagnosisId', ParseUUIDPipe) diagnosisId: string,
        @Body() dto: UpdateDiagnosisDto,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.consultationsService.updateDiagnosis(id, diagnosisId, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Remove a diagnosis from your draft' })
    @Authorize('consultation.create')
    @Delete('consultations/:id/diagnoses/:diagnosisId')
    removeDiagnosis(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('diagnosisId', ParseUUIDPipe) diagnosisId: string,
        @OrganizationId() orgId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.consultationsService.removeDiagnosis(id, diagnosisId, orgId, user.sub);
    }

    // ── Signing and addenda ──────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Sign your draft (PRD 14 §7)',
        description: 'Needs a presenting complaint, a primary diagnosis and an outcome (FOLLOW_UP needs `followUpOn`). The note is locked after.',
    })
    @Authorize('consultation.create')
    @Post('consultations/:id/sign')
    sign(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.consultationsService.sign(id, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Add to a signed note, attributed to you. Returns `{ id, message }`' })
    @Authorize('consultation.create')
    @Post('consultations/:id/addenda')
    addAddendum(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddAddendumDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.consultationsService.addAddendum(id, dto.text, orgId, user.sub);
    }

    // ── Past medical history and the code list ───────────────────────────────

    @ApiOperation({
        summary: "The patient's past medical history: their conditions, each with its latest certainty",
        description: '`{ count, docs }`, newest first, from signed consultations; differentials are left out.',
    })
    @Authorize('consultation.view')
    @Get('patients/:id/diagnoses')
    patientDiagnoses(@Param('id', ParseUUIDPipe) id: string, @Query() query: PatientDiagnosisQueryDto, @OrganizationId() orgId: string) {
        return this.consultationsService.patientDiagnoses(id, query, orgId);
    }

    @ApiOperation({ summary: 'Search the diagnosis code list (ICD-10) by code or title: `{ count, docs }`' })
    @Authorize()
    @Get('diagnosis-codes')
    diagnosisCodes(@Query() query: DiagnosisCodeQueryDto) {
        return this.consultationsService.diagnosisCodes(query);
    }
}
