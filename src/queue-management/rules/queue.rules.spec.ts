import { countsByQueue, servingOrder, worklistSearch } from './queue.rules';

describe('countsByQueue', () => {
    it('totals each queue by status', () => {
        const counts = countsByQueue(['nursing'], [
            { queueId: 'nursing', status: 'WAITING', count: 12 },
            { queueId: 'nursing', status: 'HELD', count: 3 },
            { queueId: 'nursing', status: 'AWAITING_SERVICE', count: 2 },
            { queueId: 'nursing', status: 'IN_SERVICE', count: 1 },
        ]);
        expect(counts.get('nursing')).toEqual({ total: 18, waiting: 12, held: 3, awaitingService: 2, called: 0, inService: 1 });
    });

    it('shows a queue with nobody on it as zeros', () => {
        expect(countsByQueue(['pharmacy'], []).get('pharmacy')).toEqual({ total: 0, waiting: 0, held: 0, awaitingService: 0, called: 0, inService: 0 });
    });

    it("ignores finished tasks and queues that aren't the caller's", () => {
        const counts = countsByQueue(['nursing'], [
            { queueId: 'nursing', status: 'COMPLETED', count: 40 },
            { queueId: 'someone-elses', status: 'WAITING', count: 5 },
        ]);
        expect(counts.get('nursing')!.total).toBe(0);
        expect(counts.has('someone-elses')).toBe(false);
    });
});

describe('servingOrder', () => {
    const at = (minute: number) => new Date(2026, 9, 20, 9, minute);
    const ids = (entries: { id: string }[]) => entries.map(e => e.id);

    it('serves higher priority first, then longest ready', () => {
        expect(ids(servingOrder([
            { id: 'routine-early', priority: 'ROUTINE',   status: 'WAITING', readyAt: at(0) },
            { id: 'emergency',     priority: 'EMERGENCY', status: 'WAITING', readyAt: at(30) },
            { id: 'routine-late',  priority: 'ROUTINE',   status: 'WAITING', readyAt: at(10) },
        ]))).toEqual(['emergency', 'routine-early', 'routine-late']);
    });

    it('puts a patient back from paying ahead of those still waiting at the same priority', () => {
        expect(ids(servingOrder([
            { id: 'waiting', priority: 'ROUTINE', status: 'WAITING',          readyAt: at(0) },
            { id: 'paid',    priority: 'ROUTINE', status: 'AWAITING_SERVICE', readyAt: at(20) },
        ]))).toEqual(['paid', 'waiting']);
    });

    it('still serves an emergency before a patient back from paying', () => {
        expect(ids(servingOrder([
            { id: 'paid',      priority: 'ROUTINE',   status: 'AWAITING_SERVICE', readyAt: at(0) },
            { id: 'emergency', priority: 'EMERGENCY', status: 'WAITING',          readyAt: at(20) },
        ]))).toEqual(['emergency', 'paid']);
    });
});

describe('worklistSearch', () => {
    it('filters nothing without a search', () => {
        expect(worklistSearch()).toEqual({});
        expect(worklistSearch('   ')).toEqual({});
    });

    it('needs every word to match one of the names', () => {
        const where = worklistSearch(' ada  obi ') as { AND: { OR: unknown[] }[] };
        expect(where.AND).toHaveLength(2);
        expect(where.AND[0].OR).toContainEqual({ patient: { user: { firstName: { contains: 'ada', mode: 'insensitive' } } } });
        expect(where.AND[1].OR).toContainEqual({ patient: { user: { lastName: { contains: 'obi', mode: 'insensitive' } } } });
    });

    it('matches a number against the ticket and the patient number', () => {
        const [term] = (worklistSearch('17') as { AND: { OR: unknown[] }[] }).AND;
        expect(term.OR).toContainEqual({ ticketNumber: 17 });
        expect(term.OR).toContainEqual({ patient: { patientNumber: 17 } });
    });

    it('matches an encounter code by its number, padded or not', () => {
        const [term] = (worklistSearch('enc-26-476') as { AND: { OR: unknown[] }[] }).AND;
        expect(term.OR).toContainEqual({ encounter: { encounterNumber: 476 } });
        expect(term.OR).not.toContainEqual({ ticketNumber: expect.anything() });
    });

    it("doesn't treat a name as a number", () => {
        const [term] = (worklistSearch('ada') as { AND: { OR: unknown[] }[] }).AND;
        expect(term.OR).not.toContainEqual({ ticketNumber: expect.anything() });
    });
});
