import { countsByQueue } from './queue.rules';

describe('countsByQueue', () => {
    it('totals each queue by status', () => {
        const counts = countsByQueue(['nursing'], [
            { queueId: 'nursing', status: 'WAITING', count: 12 },
            { queueId: 'nursing', status: 'HELD', count: 3 },
            { queueId: 'nursing', status: 'IN_SERVICE', count: 1 },
        ]);
        expect(counts.get('nursing')).toEqual({ total: 16, waiting: 12, held: 3, called: 0, inService: 1 });
    });

    it('shows a queue with nobody on it as zeros', () => {
        expect(countsByQueue(['pharmacy'], []).get('pharmacy')).toEqual({ total: 0, waiting: 0, held: 0, called: 0, inService: 0 });
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
