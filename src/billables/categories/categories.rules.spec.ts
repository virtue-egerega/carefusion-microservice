import { categoryUpdateRefusal } from './categories.rules';

describe('categoryUpdateRefusal', () => {
    it('reports a missing category', () => {
        expect(categoryUpdateRefusal(null, false)).toBe('Billable category not found');
        expect(categoryUpdateRefusal(null, true)).toBe('Billable category not found');
    });

    it("refuses a kind change once the category has items", () => {
        expect(categoryUpdateRefusal({ itemCount: 3 }, true)).toMatch(/has 3 item\(s\), so its kind can't change/);
    });

    it('treats an empty category as not found, since a kind change on it would have succeeded', () => {
        expect(categoryUpdateRefusal({ itemCount: 0 }, true)).toBe('Billable category not found');
    });
});
