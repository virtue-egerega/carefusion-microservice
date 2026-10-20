// Pure rules for PRD 12 (no DB access) — unit-tested in categories.rules.spec.ts.

/**
 * Why a category update matched no row (PRD 12 §3.2). The update itself is conditional
 * (`kind` only changes while the category has no items), so this runs only after it failed.
 */
export function categoryUpdateRefusal(found: { itemCount: number } | null, kindChanging: boolean): string {
    if (!found) return 'Billable category not found';
    if (kindChanging && found.itemCount > 0) {
        return `This category has ${found.itemCount} item(s), so its kind can't change. Create a new category and move the items instead`;
    }
    return 'Billable category not found';
}
