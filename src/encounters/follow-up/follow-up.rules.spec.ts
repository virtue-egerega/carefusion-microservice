import { followUpCutoff } from './follow-up.rules';

describe('followUpCutoff', () => {
    it('is the start of today (UTC): visits untouched since yesterday need following up', () => {
        expect(followUpCutoff(new Date('2026-10-19T15:42:10Z'))).toEqual(new Date('2026-10-19T00:00:00Z'));
    });

    it('is still today just after midnight', () => {
        expect(followUpCutoff(new Date('2026-10-20T00:00:01Z'))).toEqual(new Date('2026-10-20T00:00:00Z'));
    });
});
