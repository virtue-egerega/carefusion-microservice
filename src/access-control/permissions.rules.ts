// Pure rules for the grouped pickers (no DB access) — unit-tested in permissions.rules.spec.ts.

import type { PermissionEntry } from './permissions.catalog';

/** Grouped pickers page by group, never more than this many per page. */
export const GROUP_PAGE_MAX = 10;

/** A requested page window clamped to 1..GROUP_PAGE_MAX groups and a non-negative offset. */
export function groupPage(limit: number, offset: number): { limit: number; offset: number } {
    return {
        limit:  Math.min(Math.max(limit, 1), GROUP_PAGE_MAX),
        offset: Math.max(offset, 0),
    };
}

export type PermissionGroup = { group: string; permissions: PermissionEntry[] };

/**
 * One page of permission groups. A permission's group is its key's first segment. `search` filters
 * permissions first (key, name or description), so a group keeps only its matches and groups with
 * none drop out; `count` is the number of matching groups. Groups are never split across pages, and
 * come alphabetically, as do the permissions within each.
 */
export function pagePermissionGroups(
    catalog: PermissionEntry[],
    { limit, offset, search, group }: { limit: number; offset: number; search?: string; group?: string },
): { count: number; docs: PermissionGroup[] } {
    const term = search?.trim().toLowerCase();
    const groups = new Map<string, PermissionEntry[]>();

    for (const perm of catalog) {
        const key = perm.key.split('.')[0];
        if (group && key !== group) continue;
        if (term && !perm.key.includes(term) && !perm.name.toLowerCase().includes(term) && !perm.description.toLowerCase().includes(term)) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ key: perm.key, name: perm.name, description: perm.description });
    }

    // Alphabetical so users can find things: groups by name, permissions by name within a group
    const sorted = [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, permissions]) => ({ group: key, permissions: permissions.sort((a, b) => a.name.localeCompare(b.name)) }));

    const page = groupPage(limit, offset);
    const docs = sorted.slice(page.offset, page.offset + page.limit);
    return { count: groups.size, docs };
}
