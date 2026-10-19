import { PatientNumbers } from './patient-numbers';

function loaded(rows: { hospitalId: string; _max: { patientNumber: number | null } }[]) {
    const groupBy = jest.fn().mockResolvedValue(rows);
    const numbers = new PatientNumbers({ client: { patient: { groupBy } } } as any);
    return { numbers, groupBy };
}

describe('PatientNumbers', () => {
    it('continues each organisation from its highest number loaded at boot', async () => {
        const { numbers } = loaded([
            { hospitalId: 'org-a', _max: { patientNumber: 41 } },
            { hospitalId: 'org-b', _max: { patientNumber: 7 } },
        ]);
        await numbers.onModuleInit();

        expect(numbers.next('org-a', 1)).toBe(42);
        expect(numbers.next('org-b', 1)).toBe(8);
        expect(numbers.next('org-a', 1)).toBe(43);
    });

    it('starts an organisation with no patients at 1', async () => {
        const { numbers } = loaded([]);
        await numbers.onModuleInit();

        expect(numbers.next('new-org', 1)).toBe(1);
        expect(numbers.next('new-org', 1)).toBe(2);
    });

    it('reads the database once at boot and never when handing out numbers', async () => {
        const { numbers, groupBy } = loaded([{ hospitalId: 'org-a', _max: { patientNumber: 1 } }]);
        await numbers.onModuleInit();
        for (let i = 0; i < 5; i++) numbers.next('org-a', 1);

        expect(groupBy).toHaveBeenCalledTimes(1);
    });

    it('never gives concurrent registrations the same number', async () => {
        const { numbers } = loaded([]);
        await numbers.onModuleInit();

        // Each "registration" takes its number, then awaits its insert, like PatientsService does
        const taken = await Promise.all(
            Array.from({ length: 100 }, async () => {
                const n = numbers.next('org-a', 1);
                await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
                return n;
            }),
        );

        expect(new Set(taken).size).toBe(100);
        expect(Math.max(...taken)).toBe(100);
    });

    it("starts at the organisation's patientNumberStart", async () => {
        const { numbers } = loaded([]);
        await numbers.onModuleInit();

        expect(numbers.next('new-org', 1001)).toBe(1001);
        expect(numbers.next('new-org', 1001)).toBe(1002);
    });

    it('jumps to a raised start, and ignores a start below numbers already issued', async () => {
        const { numbers } = loaded([{ hospitalId: 'org-a', _max: { patientNumber: 10050 } }]);
        await numbers.onModuleInit();

        expect(numbers.next('org-a', 1001)).toBe(10051);   // start already passed
        expect(numbers.next('org-a', 5001)).toBe(5001);   // start raised above existing numbers
        expect(numbers.next('org-a', 5001)).toBe(5002);
    });

    it('leaves a gap when a registration fails after taking its number', async () => {
        const { numbers } = loaded([{ hospitalId: 'org-a', _max: { patientNumber: 41 } }]);
        await numbers.onModuleInit();

        numbers.next('org-a', 1);              // B takes 42, then its insert fails
        expect(numbers.next('org-a', 1)).toBe(43);   // C is unaffected
    });
});
