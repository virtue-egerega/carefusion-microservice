import { CLINIC_CATALOG, DEPARTMENT_CATALOG } from './departments.catalog';

const clinic = (key: string) => CLINIC_CATALOG.find(c => c.systemKey === key);
const queueKeysOf = (deptKey: string) => DEPARTMENT_CATALOG.find(d => d.systemKey === deptKey)!.queues.map(q => q.systemKey);

describe('CLINIC_CATALOG', () => {
    it('starts GOPD patients at the GOPD nursing station, then General Consultation (11 §3.3)', () => {
        expect(clinic('GOPD')).toEqual({
            systemKey: 'GOPD', name: 'General Outpatient (GOPD)', departmentKey: 'OUTPATIENT',
            triageQueue: 'OUTPATIENT_TRIAGE', consultationQueue: 'GENERAL_CONSULTATION',
        });
    });

    it("gives each clinic department a main clinic named after its doctors' queue", () => {
        expect(clinic('OPHTHALMOLOGY')).toMatchObject({ name: 'Eye Clinic', triageQueue: 'OPHTHALMOLOGY_TRIAGE', consultationQueue: 'OPHTHALMOLOGY_CONSULTATION' });
        expect(clinic('PEDIATRICS')).toMatchObject({ name: 'Paediatric Clinic' });
    });

    it("lets specialty clinics share their department's nursing station", () => {
        expect(clinic('DIABETES')).toMatchObject({ triageQueue: 'INTERNAL_MEDICINE_TRIAGE', consultationQueue: 'DIABETES_CLINIC' });
        expect(clinic('HYPERTENSION')).toMatchObject({ triageQueue: 'INTERNAL_MEDICINE_TRIAGE', consultationQueue: 'HYPERTENSION_CLINIC' });
        expect(clinic('ANTENATAL')).toMatchObject({ triageQueue: 'OBSTETRICS_GYNAECOLOGY_TRIAGE', consultationQueue: 'ANTENATAL_CLINIC' });
    });

    it('has no clinics for departments patients only reach through orders', () => {
        const departmentsWithClinics = new Set(CLINIC_CATALOG.map(c => c.departmentKey));
        for (const key of ['EMERGENCY', 'PHARMACY', 'LABORATORY', 'RADIOLOGY', 'ACCOUNTS', 'THEATRE', 'ICU', 'NURSING']) {
            expect(departmentsWithClinics.has(key)).toBe(false);
        }
    });

    it("only names queues that belong to the clinic's department", () => {
        for (const c of CLINIC_CATALOG) {
            expect(queueKeysOf(c.departmentKey)).toEqual(expect.arrayContaining([c.triageQueue, c.consultationQueue]));
        }
    });

    it('has unique keys', () => {
        const keys = CLINIC_CATALOG.map(c => c.systemKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
