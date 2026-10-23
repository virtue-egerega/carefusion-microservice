import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, CurrentUser, OrganizationId } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/permissions.guard';
import { CorrectVitalsDto, RecordTriageDto, RecordVitalsDto, RemoveVitalsDto, VitalsQueryDto } from '@shared/contracts/triage';
import { TriageService } from './triage.service';

@ApiTags('triage')
@Controller()
export class TriageController {
    constructor(private readonly triageService: TriageService) {}

    // ── Triage assessment ────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Record the triage, or re-triage (PRD 11 §8)',
        description: 'A new version replacing the current one, which stays on record; re-triaging needs `changeReason`. ' +
            "The presenting complaint becomes the encounter's reason for visit, and `priority` goes on the encounter and its " +
            'active tasks. Returns `{ id, message }`. 404 unknown encounter, 409 closed encounter.',
    })
    @Authorize('triage.create')
    @Post('encounters/:id/triage')
    recordTriage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordTriageDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.triageService.recordTriage(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: "The encounter's current triage and its earlier versions, newest first: `{ current, history }`" })
    @Authorize('triage.view')
    @Get('encounters/:id/triage')
    getTriage(@Param('id', ParseUUIDPipe) id: string, @OrganizationId() orgId: string) {
        return this.triageService.getTriage(id, orgId);
    }

    // ── Vitals ───────────────────────────────────────────────────────────────

    @ApiOperation({
        summary: 'Record a vital signs reading (PRD 11 §9)',
        description: 'At least one vital; blood pressure as a pair; `takenAt` after the patient arrived and not in the future. ' +
            'Returns `{ id, message }`. 404 unknown encounter, 409 closed encounter.',
    })
    @Authorize('triage.create')
    @Post('encounters/:id/vitals')
    recordVitals(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordVitalsDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.triageService.recordVitals(id, dto, orgId, user.sub);
    }

    @ApiOperation({
        summary: "The encounter's vital signs by when they were taken, newest first",
        description: '`{ count, docs }`. Removed readings are included (struck through: `removedAt`, `removedBy`, `removeReason`) ' +
            'unless `includeRemoved=false`; readings replaced by a correction (`replacedBy`) only with `includeReplaced=true`.',
    })
    @Authorize('triage.view')
    @Get('encounters/:id/vitals')
    listVitals(@Param('id', ParseUUIDPipe) id: string, @Query() query: VitalsQueryDto, @OrganizationId() orgId: string) {
        return this.triageService.listVitals(id, query, orgId);
    }

    @ApiOperation({
        summary: 'Correct a reading',
        description: 'Send only the fields that change (null clears one) and `editReason`. The corrected reading is saved as a ' +
            'new reading replacing this one, which stays on record. Returns `{ id, message }` with the new reading. 409 if this ' +
            'reading was removed or already corrected.',
    })
    @Authorize('triage.create')
    @Patch('vitals/:id')
    correctVitals(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectVitalsDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.triageService.correctVitals(id, dto, orgId, user.sub);
    }

    @ApiOperation({ summary: 'Remove a reading: it stays on record, struck through, with who removed it and why' })
    @Authorize('triage.create')
    @Post('vitals/:id/remove')
    @HttpCode(200)
    removeVitals(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RemoveVitalsDto, @OrganizationId() orgId: string, @CurrentUser() user: AuthUser) {
        return this.triageService.removeVitals(id, dto.reason, orgId, user.sub);
    }
}
