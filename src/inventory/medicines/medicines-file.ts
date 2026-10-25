// Reads prisma/data/medicines/medicines-*.json into Medicine rows (15 §3.1). Pure, no DB access: the allowed
// values come in from the caller (the Prisma enums). Unit-tested in medicines-file.spec.ts.
//
// Each entry: { generic_name, dosage_form, route, strength, strength_options, presentation, aliases, ingredients,
// therapeutic_uses, body_systems, atc_code, legal_category, controlled, nhis_code, description, source_system, source_url }.
// A medicine is generic name (any case) + dosage form + route. Entries for the same medicine, in one file or
// across files, are one row: their lists (strengths, aliases, NHIS codes…) are combined, and their single
// values must agree. Strength is the product's (Emzor Paracetamol 500 mg), so the listed strengths are kept
// only as the strengths the source lists, not as part of the medicine. Therapeutic uses are codes such as
// "GENERAL_ANAESTHESIA"; the seeder creates a use the first time a medicine names it.

export type MedicineRow = {
    genericName: string;
    dosageForm: string;
    route: string;
    ingredients: string[];
    aliases: string[];
    therapeuticUses: string[]; // TherapeuticUse codes
    bodySystems: string[];
    atcCode: string | null;
    legalCategory: string; // POM when the source doesn't say
    controlled: boolean | null; // null = the source doesn't say
    strengths: string[];
    presentations: string[];
    nhisCodes: string[];
    description: string | null;
    sourceSystem: string | null;
    sourceUrl: string | null;
};

export type MedicineValues = {
    dosageForms: readonly string[];
    routes: readonly string[];
    bodySystems: readonly string[];
    legalCategories: readonly string[];
};

// upper case words joined by underscores, so "Pain" and "PAIN" can't become two uses
const USE_CODE = /^[A-Z0-9]+(_[A-Z0-9]+)*$/;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const absent = (value: unknown) => value === null || value === undefined;

/** What staff see for a use code: GENERAL_ANAESTHESIA → "General anaesthesia". Editable once seeded. */
export function useName(code: string): string {
    const words = code.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Every medicine across the files, entries for the same medicine combined, in name order. Collects every
 * problem in every file and throws them together, so one run shows them all.
 */
export function parseMedicines(files: { name: string; json: unknown }[], values: MedicineValues): MedicineRow[] {
    const errors: string[] = [];
    const rows = new Map<string, { row: MedicineRow; at: string }>();

    for (const file of files) {
        const entries = (file.json as { medicines?: unknown })?.medicines;
        if (!Array.isArray(entries)) {
            errors.push(`${file.name}: expected { "medicines": [ ... ] }`);
            continue;
        }

        entries.forEach((entry, index) => {
            const genericName = text(entry?.generic_name);
            const at = `${file.name} entry ${index + 1} (${genericName ?? '?'})`;
            const problems: string[] = [];
            const list = (field: string, allowed?: readonly string[]) => {
                const value = entry?.[field];
                if (absent(value)) return [];
                if (!Array.isArray(value) || value.some(v => !text(v))) {
                    problems.push(`${field} must be a list of names`);
                    return [];
                }
                const items = [...new Set(value.map((v: string) => v.trim()))];
                const unknown = allowed ? items.filter(v => !allowed.includes(v)) : [];
                if (unknown.length) problems.push(`${field} has unknown value(s): ${unknown.join(', ')}`);
                return items;
            };
            const single = (field: string, allowed: readonly string[], required: boolean) => {
                const value = text(entry?.[field]);
                if (!value) {
                    if (required || !absent(entry?.[field])) problems.push(`${field} is required`);
                } else if (!allowed.includes(value)) {
                    problems.push(`${field} "${value}" is not one of the allowed values`);
                }
                return value;
            };
            const optionalText = (field: string) => {
                if (!absent(entry?.[field]) && !text(entry[field])) problems.push(`${field} must be text or null`);
                return text(entry?.[field]);
            };

            if (!genericName) problems.push('generic_name is required');
            const dosageForm = single('dosage_form', values.dosageForms, true);
            const route = single('route', values.routes, true);
            const legalCategory = single('legal_category', values.legalCategories, false);
            if (!absent(entry?.controlled) && typeof entry.controlled !== 'boolean') problems.push('controlled must be true, false or null');

            const uses = list('therapeutic_uses');
            const badUses = uses.filter(code => !USE_CODE.test(code));
            if (badUses.length) problems.push(`therapeutic_uses must be codes like GENERAL_ANAESTHESIA: ${badUses.join(', ')}`);
            const strength = optionalText('strength');
            const presentation = optionalText('presentation');
            const nhisCode = optionalText('nhis_code');

            const row: MedicineRow = {
                genericName: genericName ?? '',
                dosageForm: dosageForm ?? '',
                route: route ?? '',
                ingredients: list('ingredients'),
                aliases: list('aliases'),
                therapeuticUses: uses,
                bodySystems: list('body_systems', values.bodySystems),
                atcCode: optionalText('atc_code')?.toUpperCase() ?? null,
                legalCategory: legalCategory as string,
                controlled: typeof entry?.controlled === 'boolean' ? entry.controlled : null,
                strengths: [...new Set([...(strength ? [strength] : []), ...list('strength_options')])],
                presentations: presentation ? [presentation] : [],
                nhisCodes: nhisCode ? [nhisCode] : [],
                description: optionalText('description'),
                sourceSystem: optionalText('source_system'),
                sourceUrl: optionalText('source_url'),
            };
            if (!row.ingredients.length) row.ingredients = genericName ? [genericName] : [];

            if (problems.length) {
                errors.push(...problems.map(p => `${at}: ${p}`));
                return;
            }

            const key = `${genericName!.toLowerCase()}|${dosageForm}|${route}`;
            const earlier = rows.get(key);
            if (!earlier) {
                rows.set(key, { row, at });
                return;
            }
            const conflicts = combine(earlier.row, row);
            errors.push(...conflicts.map(field => `${at}: same medicine as ${earlier.at}, but a different ${field}`));
        });
    }

    if (errors.length) throw new Error(`Medicine files have ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
    return [...rows.values()].map(r => ({ ...r.row, legalCategory: r.row.legalCategory ?? 'POM' }))
        .sort((a, b) => a.genericName.localeCompare(b.genericName) || a.dosageForm.localeCompare(b.dosageForm) || a.route.localeCompare(b.route));
}

const LISTS = ['ingredients', 'aliases', 'therapeuticUses', 'bodySystems', 'strengths', 'presentations', 'nhisCodes'] as const;
const SINGLES = ['atcCode', 'legalCategory', 'controlled', 'description', 'sourceSystem', 'sourceUrl'] as const;

/** Folds a later entry for the same medicine into the first: lists combine, a value fills a gap; returns the fields that disagree. */
function combine(into: MedicineRow, from: MedicineRow): string[] {
    for (const field of LISTS) into[field] = [...new Set([...into[field], ...from[field]])];

    const conflicts: string[] = [];
    for (const field of SINGLES) {
        if (from[field] === null) continue;
        if (into[field] === null) (into as Record<string, unknown>)[field] = from[field];
        else if (into[field] !== from[field]) conflicts.push(field);
    }
    return conflicts;
}
