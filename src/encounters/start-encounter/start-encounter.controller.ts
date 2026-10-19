import { Body, Controller, ForbiddenException, Get, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StartEncounterDto } from '@shared/contracts/encounters';
import { Authorize, BranchId, CurrentUser, OrganizationId } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/permissions.guard';
import { StartEncounterService } from './start-encounter.service';

@ApiTags('encounters')
@Controller('encounters')
export class StartEncounterController {
    constructor(private readonly startEncounterService: StartEncounterService) {}

    @ApiOperation({
        summary: "Start the patient's encounter — open their visit at the clinic they came for and send them to billing, the nursing station, or both",
        description:
            "The consultation fee posts now. sendTo picks the lists (default: the clinic's nursing station); anything else must be " +
            "on your duty profiles' send lists (GET /queues/sendable). Billing and nursing tasks are never held: when the hospital " +
            "collects before consultation, the doctor's task waits for payment. 409 with code OPEN_ENCOUNTER if the patient has an " +
            "unfinished visit at this branch: resend with continueEncounter, or follow it up and cancel its tasks first.",
    })
    @Authorize('encounter.create')
    @Post()
    startEncounter(
        @Body() dto: StartEncounterDto,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
        @CurrentUser() user: AuthUser,
    ) {
        // Overriding the default coverage is a coverage choice (10 §5)
        if ((dto.coverageId || dto.selfPay) && !user.permissions.includes('coverage.select')) {
            throw new ForbiddenException('Missing permission: coverage.select');
        }
        return this.startEncounterService.startEncounter(dto, { organizationId, branchId }, user);
    }

    @ApiOperation({ summary: "The patient's unfinished visit at your branch, with its remaining tasks (null if none)" })
    @Authorize('encounter.create')
    @Get('open')
    findOpen(
        @Query('patientId', ParseUUIDPipe) patientId: string,
        @OrganizationId() organizationId: string,
        @BranchId() branchId: string,
    ) {
        return this.startEncounterService.findOpen(patientId, { organizationId, branchId });
    }
}
