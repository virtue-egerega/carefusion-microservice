import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authorize, BranchId, OrganizationId } from '../../auth/auth.decorators';
import { FollowUpService } from './follow-up.service';

@ApiTags('encounters')
@Controller('encounters')
export class FollowUpController {
    constructor(private readonly followUpService: FollowUpService) {}

    @ApiOperation({
        summary: 'Unfinished visits to follow up: open visits at your branch with no task activity today',
        description: 'Reach the patient, then continue the visit (start the encounter with continueEncounter) or cancel its tasks with patientLeft.',
    })
    @Authorize('encounter.follow_up')
    @Get('follow-up')
    list(@OrganizationId() organizationId: string, @BranchId() branchId: string) {
        return this.followUpService.list({ organizationId, branchId });
    }
}
