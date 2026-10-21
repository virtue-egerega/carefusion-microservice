import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { $Enums } from '../../../generated/prisma/client';
import { ACTIVE_TASK } from '../tasks/tasks.rules';
import { followUpCutoff } from './follow-up.rules';

@Injectable()
export class FollowUpService {
    constructor(private readonly databaseService: DatabaseService) {}

    /**
     * Unfinished visits to follow up (11 §14.2): open outpatient encounters at this branch with no
     * task activity today. Emergency patients (observation can run overnight) and admitted patients
     * aren't listed. Nothing closes on its own: staff reach the patient, then continue the visit or
     * cancel its tasks.
     */
    list(at: { organizationId: string; branchId: string }) {
        const since = followUpCutoff(new Date());
        return this.databaseService.client.encounter.findMany({
            where: {
                organizationId: at.organizationId,
                branchId:       at.branchId,
                status:         $Enums.EncounterStatus.OPEN,
                encounterType:  $Enums.EncounterType.OUTPATIENT,
                department:     { systemKey: { not: 'EMERGENCY' } },
                queueEntries:   {
                    none: {
                        OR: [
                            { enteredAt: { gte: since } }, { calledAt: { gte: since } },
                            { startedAt: { gte: since } }, { completedAt: { gte: since } },
                        ],
                    },
                },
            },
            orderBy: { arrivedAt: 'asc' },
            select: {
                id: true, code: true, arrivedAt: true, firstSeenAt: true, reasonForVisit: true,
                clinic:  { select: { name: true } },
                patient: { select: { id: true, patientNumber: true, user: { select: { firstName: true, lastName: true, phone: true } } } },
                queueEntries: {
                    where:   { status: { in: [...ACTIVE_TASK] } },
                    orderBy: { enteredAt: 'asc' },
                    select:  { id: true, status: true, holdReason: true, enteredAt: true, queue: { select: { name: true } } },
                },
            },
        });
    }
}
