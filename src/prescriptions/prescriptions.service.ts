import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { $Enums } from '../../generated/prisma/client';
import { PrescribableMedicinesQuery, prescribableMedicines } from './prescriptions.rules';

export type PrescriptionMedicinesQuery = PrescribableMedicinesQuery & {
    dosageForm?:    $Enums.DosageForm;
    route?:         $Enums.MedicineRoute;
    bodySystem?:    $Enums.MedicineBodySystem;
    legalCategory?: $Enums.LegalCategory;
    limit:          number;
    offset:         number;
};

/**
 * Prescribing (PRD 16). A prescription is a clinical order for any medicine: it isn't a charge and
 * doesn't depend on stock. Whether it's billed, and what is given, is decided at the dispensary.
 */
@Injectable()
export class PrescriptionsService {
    constructor(private readonly databaseService: DatabaseService) {}

    /** Medicines to prescribe from (16 §3), each with its uses; no products, stock or prices. */
    async findMedicines(organizationId: string, { limit, offset, ...query }: PrescriptionMedicinesQuery) {
        const client = this.databaseService.client;
        const where = prescribableMedicines(organizationId, query);

        const [count, medicines] = await client.$transaction([
            client.medicine.count({ where }),
            client.medicine.findMany({
                where,
                select: {
                    id:              true,
                    genericName:     true,
                    strength:        true,
                    dosageForm:      true,
                    route:           true,
                    legalCategory:   true,
                    controlled:      true,
                    therapeuticUses: { select: { use: { select: { code: true, name: true } } } },
                },
                take:    limit,
                skip:    offset,
                orderBy: [{ genericName: 'asc' }, { strength: 'asc' }, { dosageForm: 'asc' }, { route: 'asc' }],
            }),
        ]);

        return {
            count,
            docs: medicines.map(({ therapeuticUses, ...medicine }) => ({
                ...medicine,
                therapeuticUses: therapeuticUses.map(({ use }) => use),
            })),
        };
    }
}
