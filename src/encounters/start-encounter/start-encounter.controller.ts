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
        summary: "Start the patient's encounter at the clinic they came for: closes their open visit, charges the fee, sends them on ready to be served",
        description:
            "In one transaction: the patient's open encounter at this branch closes (its tasks cancelled: 'Closed: new encounter … started'); " +
            "the consultation fee is charged straight to the account, with no billing task; and the patient goes on the sendTo lists " +
            "(default: the clinic's nursing station) as AWAITING_SERVICE. consultationPayment BEFORE: the account must already hold the fee; " +
            "AFTER: it may owe up to maxUnpaidBeforeHold after the fee. 409 INSUFFICIENT_FUNDS (says how much to deposit) or " +
            "PATIENT_ADMITTED (discharge first); a refusal changes nothing. sendTo queues other than the nursing station must be on your " +
            "duty profiles' send lists (GET /queues/sendable).",
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
