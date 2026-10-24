import { drugUpdateRefusal, visibleDrugs } from './drugs.rules';

describe('visibleDrugs', () => {
    it('shows system drugs and the organisation\'s own by default', () => {
        expect(visibleDrugs('org-1')).toEqual({ OR: [{ organizationId: null }, { organizationId: 'org-1' }] });
    });

    it('narrows to system drugs', () => {
        expect(visibleDrugs('org-1', 'SYSTEM')).toEqual({ organizationId: null });
    });

    it("narrows to the hospital's own drugs, never another organisation's", () => {
        expect(visibleDrugs('org-1', 'HOSPITAL')).toEqual({ organizationId: 'org-1' });
    });
});

describe('drugUpdateRefusal', () => {
    it('refuses a system drug as forbidden', () => {
        const refusal = drugUpdateRefusal({ organizationId: null });
        expect(refusal.forbidden).toBe(true);
        expect(refusal.reason).toMatch(/System drugs can't be changed/);
    });

    it('reports a missing drug as not found', () => {
        expect(drugUpdateRefusal(null)).toEqual({ reason: 'Drug not found' });
    });

    it("treats another organisation's drug as not found, so it isn't revealed", () => {
        expect(drugUpdateRefusal({ organizationId: 'org-2' })).toEqual({ reason: 'Drug not found' });
    });
});
