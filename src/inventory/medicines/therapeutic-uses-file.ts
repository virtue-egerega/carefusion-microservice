// Reads prisma/data/medicines/therapeutic-uses.json into TherapeuticUse rows (15 §3). Pure, no DB access.
// Unit-tested in therapeutic-uses-file.spec.ts.
//
// Each entry is an ATC group: { name, parent, atc_code, atc_level, description, source_system, source_url, aliases }.
// One entry is one row. `parent` is the name of the group one level up, kept as a label for display and search.

export type TherapeuticUseRow = {
    atcCode: string;
    atcLevel: number;
    name: string;
    parentName: string | null;
    description: string | null;
    aliases: string[];
    sourceSystem: string | null;
    sourceUrl: string | null;
};

// ATC code shape by level: A, A02, A02B, A02BC, A02BC01
const ATC_CODE: Record<number, RegExp> = {
    1: /^[A-Z]$/,
    2: /^[A-Z]\d{2}$/,
    3: /^[A-Z]\d{2}[A-Z]$/,
    4: /^[A-Z]\d{2}[A-Z]{2}$/,
    5: /^[A-Z]\d{2}[A-Z]{2}\d{2}$/,
};

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Every use in the file, in ATC order. Collects every problem and throws them together, so one run shows them all. */
export function parseTherapeuticUses(json: unknown): TherapeuticUseRow[] {
    const entries = (json as { therapeutic_uses?: unknown })?.therapeutic_uses;
    if (!Array.isArray(entries)) throw new Error('Therapeutic uses file: expected { "therapeutic_uses": [ ... ] }');

    const errors: string[] = [];
    const rows = new Map<string, TherapeuticUseRow>();

    entries.forEach((entry, index) => {
        const name = text(entry?.name);
        const at = `entry ${index + 1} (${name ?? '?'})`;
        const atcCode = text(entry?.atc_code)?.toUpperCase() ?? null;
        const atcLevel = entry?.atc_level;
        const aliases = entry?.aliases ?? [];
        const parentGiven = entry?.parent !== null && entry?.parent !== undefined;

        if (!name) errors.push(`${at}: needs a name`);
        if (!ATC_CODE[atcLevel]) errors.push(`${at}: atc_level must be 1 to 5`);
        else if (!atcCode || !ATC_CODE[atcLevel].test(atcCode)) errors.push(`${at}: "${entry?.atc_code}" is not a level-${atcLevel} ATC code`);
        if (parentGiven && !text(entry.parent)) errors.push(`${at}: parent must be a name or null`);
        if (!Array.isArray(aliases) || aliases.some(a => !text(a))) errors.push(`${at}: aliases must be a list of names`);
        if (!name || !atcCode || !ATC_CODE[atcLevel]?.test(atcCode) || !Array.isArray(aliases)) return;

        if (rows.has(atcCode)) {
            errors.push(`${at}: ${atcCode} appears more than once`);
            return;
        }
        rows.set(atcCode, {
            atcCode,
            atcLevel,
            name,
            parentName: text(entry.parent),
            description: text(entry.description),
            aliases: [...new Set(aliases.map((a: string) => a.trim()))],
            sourceSystem: text(entry.source_system),
            sourceUrl: text(entry.source_url),
        });
    });

    if (errors.length) throw new Error(`Therapeutic uses file has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
    return [...rows.values()].sort((a, b) => a.atcCode.localeCompare(b.atcCode));
}
