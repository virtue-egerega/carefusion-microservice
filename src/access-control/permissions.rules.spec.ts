import { GROUP_PAGE_MAX, groupPage, pagePermissionGroups } from './permissions.rules';

const perm = (key: string, name = key, description = '') => ({ key, name, description });

const CATALOG = [
    perm('billing.refund.request', 'Request Refund', 'Raise refund requests'),
    perm('billing.void.request', 'Request Charge Void'),
    perm('coverage.view', 'View Coverage'),
    perm('payer.manage', 'Manage Payers'),
    perm('billable.view', 'View Billables', 'Price lines and refund-free quotes'),
];

describe('groupPage', () => {
    it(`caps a page at ${GROUP_PAGE_MAX} groups`, () => {
        expect(groupPage(50, 0)).toEqual({ limit: GROUP_PAGE_MAX, offset: 0 });
    });

    it('allows at least one group and no negative offset', () => {
        expect(groupPage(0, -5)).toEqual({ limit: 1, offset: 0 });
    });
});

describe('pagePermissionGroups', () => {
    it('counts groups, not permissions', () => {
        expect(pagePermissionGroups(CATALOG, { limit: 10, offset: 0 }).count).toBe(4);
    });

    it('pages by group, alphabetically, and keeps each group whole', () => {
        const { count, docs } = pagePermissionGroups(CATALOG, { limit: 2, offset: 0 });
        expect(count).toBe(4);
        expect(docs.map(d => d.group)).toEqual(['billable', 'billing']);
        expect(docs[1].permissions).toHaveLength(2);
    });

    it('returns the following groups at the next offset', () => {
        const { docs } = pagePermissionGroups(CATALOG, { limit: 2, offset: 2 });
        expect(docs.map(d => d.group)).toEqual(['coverage', 'payer']);
    });

    it('orders permissions by name within a group', () => {
        const { docs } = pagePermissionGroups(CATALOG, { limit: 10, offset: 0, group: 'billing' });
        expect(docs[0].permissions.map(p => p.name)).toEqual(['Request Charge Void', 'Request Refund']);
    });

    it('never returns more than the page maximum', () => {
        const many = Array.from({ length: 15 }, (_, i) => perm(`g${i}.view`));
        const { count, docs } = pagePermissionGroups(many, { limit: 100, offset: 0 });
        expect(count).toBe(15);
        expect(docs).toHaveLength(GROUP_PAGE_MAX);
    });

    it('keeps only matching permissions and drops groups with none', () => {
        const { count, docs } = pagePermissionGroups(CATALOG, { limit: 10, offset: 0, search: 'Refund' });
        expect(count).toBe(2);
        expect(docs).toEqual([
            { group: 'billable', permissions: [perm('billable.view', 'View Billables', 'Price lines and refund-free quotes')] },
            { group: 'billing', permissions: [perm('billing.refund.request', 'Request Refund', 'Raise refund requests')] },
        ]);
    });

    it('narrows to one group', () => {
        const { count, docs } = pagePermissionGroups(CATALOG, { limit: 10, offset: 0, group: 'billing' });
        expect(count).toBe(1);
        expect(docs[0].permissions).toHaveLength(2);
    });
});
