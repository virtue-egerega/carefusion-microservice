// Reads WHO's ICD-10 2019 "plain text tabular" files (prisma/data/icd10/) into DiagnosisCode,
// DiagnosisChapter and DiagnosisCodeGroup rows (14 §5). Pure, no DB access. Unit-tested in icd10-file.spec.ts.
//
// codes file, semicolon-separated, one code per line:
//   1 level (3, 4, 5)   2 T = usable code, N = heading with subdivisions   3 X / S (special subdivision)
//   4 chapter ("01")    5 first code of its group   6 code with marks ("D63.0*", "B50.-")
//   7 code, dotted ("B50.9")   8 code, no dot   9 full title   10–12 titles by level   13–17 statistics lists
// chapters file: "01;Certain infectious and parasitic diseases"
// groups file:   "A00;A09;01;Intestinal infectious diseases"

export type Icd10Chapter = { number: string; numeral: string; title: string; position: number };
export type Icd10Group = { firstCode: string; lastCode: string; chapter: string; title: string; position: number };
export type Icd10Code = { code: string; title: string; chapter: string | null; selectable: boolean };

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII'];

const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

const layoutError = (file: string, index: number) => new Error(`ICD-10 ${file} file, line ${index + 1}: not the expected layout`);

/** The 22 chapters in WHO's order, each with its roman numeral. */
export function parseIcd10Chapters(text: string): Icd10Chapter[] {
    return lines(text).map((line, position) => {
        const [number, title] = line.split(';');
        const numeral = ROMAN[Number(number) - 1];
        if (!numeral || !title) throw layoutError('chapters', position);
        return { number, numeral, title, position };
    });
}

/** The groups (blocks) in WHO's order: a range of three-character codes within a chapter. */
export function parseIcd10Groups(text: string): Icd10Group[] {
    return lines(text).map((line, position) => {
        const [firstCode, lastCode, chapter, title] = line.split(';');
        if (!firstCode || !lastCode || !chapter || !title) throw layoutError('groups', position);
        return { firstCode, lastCode, chapter, title, position };
    });
}

/** One row per code, headings included (not selectable), each citing its chapter: "I Certain infectious…". */
export function parseIcd10Codes(text: string, chapters: Icd10Chapter[]): Icd10Code[] {
    const cited = new Map(chapters.map(c => [c.number, `${c.numeral} ${c.title}`]));
    return lines(text).map((line, index) => {
        const columns = line.split(';');
        const [, node, , chapter, , , code, , title] = columns;
        if (columns.length < 9 || !code || !title || (node !== 'T' && node !== 'N')) throw layoutError('codes', index);
        return { code, title, chapter: cited.get(chapter) ?? null, selectable: node === 'T' };
    });
}

/**
 * The codes from one three-character code to another, inclusive of the last one's subdivisions:
 * A00 to A09 holds A00, A01.1 … A09.9 but not A10. Codes compare as text, which is ICD-10's order.
 */
export function codeRangeWhere(firstCode: string, lastCode: string) {
    return {
        AND: [
            { code: { gte: firstCode } },
            { OR: [{ code: { lte: lastCode } }, { code: { startsWith: lastCode } }] },
        ],
    };
}
