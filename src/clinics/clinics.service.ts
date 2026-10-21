import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { $Enums } from '../../generated/prisma/client';
import { feeExemption } from '../encounters/start-encounter/start-encounter.rules';
import { visitCoverage } from '@shared/contracts/encounters';

type At = { organizationId: string; branchId: string };

@Injectable()
export class ClinicsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** What reception picks from (11 §3.3): active clinics, by name. */
    findAll() {
        return this.databaseService.client.clinic.findMany({
            where:   { isActive: true },
            orderBy: { name: 'asc' },
            select:  { id: true, systemKey: true, name: true, department: { select: { id: true, name: true } } },
        });
    }

    /**
     * The consultation fee for seeing this clinic (11 §10.4), so reception can tell the patient
     * before starting their encounter. With a patient, it answers as starting it would: whether they'd be
     * charged (not when insured, or when continuing their open visit at the same clinic), and what
     * their account holds to pay it.
     */
    async consultationFee(clinicId: string, at: At, patientId?: string) {
        const client = this.databaseService.client;
        const now = new Date();

        const [clinic, organization, patient] = await Promise.all([
            client.clinic.findFirst({ where: { id: clinicId, isActive: true }, select: { id: true, name: true } }),
            client.organization.findUniqueOrThrow({ where: { id: at.organizationId }, select: { consultationFee: true } }),
            patientId
                ? client.patient.findFirst({
                    where:  { id: patientId, hospitalId: at.organizationId },
                    select: {
                        coverages: visitCoverage(now),
                        encounters: {
                            where:  { branchId: at.branchId, status: $Enums.EncounterStatus.OPEN },
                            select: { clinicId: true },
                            take:   1,
                        },
                        billingMemberships: {
                            where:  { leftAt: null },
                            select: { account: { select: { id: true, accountNumber: true, balance: true, unappliedCredit: true, creditLimit: true } } },
                        },
                    },
                })
                : Promise.resolve(null),
        ]);
        if (!clinic) throw new NotFoundException('Clinic not found or not active');
        const fee = { clinic, amount: organization.consultationFee };
        if (!patientId) return fee;
        if (!patient) throw new NotFoundException('Patient not found');

        const coverageId = patient.coverages[0]?.id ?? null;
        const exemption = organization.consultationFee.gt(0)
            ? feeExemption({ coverageId, continuingSameClinic: patient.encounters[0]?.clinicId === clinicId })
            : null;
        return {
            ...fee,
            charged:  organization.consultationFee.gt(0) && !exemption,
            exemption,
            coverage: coverageId && { id: coverageId },
            account:  patient.billingMemberships[0]?.account ?? null,
        };
    }
}
