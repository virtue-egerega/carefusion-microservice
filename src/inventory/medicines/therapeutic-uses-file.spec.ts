import { parseTherapeuticUses } from './therapeutic-uses-file';

const SOURCE = { source_system: 'NAFDAC_GREENBOOK', source_url: 'https://greenbook.nafdac.gov.ng/atc-classification' };
const use = (atc_code: string, name: string, parent: string | null, extra: object = {}) =>
    ({ name, parent, atc_code, atc_level: 3, description: null, aliases: [], ...SOURCE, ...extra });
const file = (...entries: object[]) => ({ therapeutic_uses: entries });

describe('parseTherapeuticUses', () => {
    it('reads one row per entry, keeping the parent as a label', () => {
        expect(parseTherapeuticUses(file(use('A02A', 'Antacids', 'Drugs for Acid Related Disorders', { description: 'Neutralise gastric acid.' })))).toEqual([{
            atcCode: 'A02A', atcLevel: 3, name: 'Antacids', parentName: 'Drugs for Acid Related Disorders', description: 'Neutralise gastric acid.',
            aliases: [], sourceSystem: 'NAFDAC_GREENBOOK', sourceUrl: SOURCE.source_url,
        }]);
    });

    it("creates no rows for the parents it names", () => {
        const rows = parseTherapeuticUses(file(
            use('A02A', 'Antacids', 'Drugs for Acid Related Disorders'),
            use('A02B', 'Drugs for Peptic Ulcer and GORD', 'Drugs for Acid Related Disorders'),
        ));
        expect(rows.map(r => r.atcCode)).toEqual(['A02A', 'A02B']);
    });

    it('accepts a parent named the same as the group', () => {
        expect(parseTherapeuticUses(file(use('A01A', 'Stomatological Preparations', 'Stomatological Preparations')))[0].parentName)
            .toBe('Stomatological Preparations');
    });

    it('accepts a level-2 entry alongside level-3 ones, in ATC order', () => {
        const rows = parseTherapeuticUses(file(use('A02A', 'Antacids', null), use('A02', 'Drugs for Acid Related Disorders', null, { atc_level: 2 })));
        expect(rows.map(r => [r.atcCode, r.atcLevel])).toEqual([['A02', 2], ['A02A', 3]]);
    });

    it('trims names, upper-cases codes and de-duplicates aliases', () => {
        const [row] = parseTherapeuticUses(file(use('a04a', '  Antiemetics and Antinauseants ', null, { aliases: ['Antiemetics', 'Antiemetics ', 'Antinauseants'] })));
        expect(row).toMatchObject({ atcCode: 'A04A', name: 'Antiemetics and Antinauseants', parentName: null, aliases: ['Antiemetics', 'Antinauseants'] });
    });

    it('refuses a file without the therapeutic_uses list', () => {
        expect(() => parseTherapeuticUses({ uses: [] })).toThrow('expected { "therapeutic_uses"');
    });

    it('reports every problem at once', () => {
        expect(() => parseTherapeuticUses(file(
            use('A02', 'Wrong level', null),
            use('A02A', '', null),
            use('A03A', 'Spasm', null, { atc_level: 7 }),
            use('A04A', 'Antiemetics', null, { aliases: ['ok', 3] }),
            use('A05A', 'Bile Therapy', '  '),
        ))).toThrow(/5 problem\(s\)[\s\S]*not a level-3 ATC code[\s\S]*needs a name[\s\S]*atc_level must be 1 to 5[\s\S]*aliases must be a list[\s\S]*parent must be a name or null/);
    });

    it('refuses a code that appears twice', () => {
        expect(() => parseTherapeuticUses(file(use('A02A', 'Antacids', null), use('A02A', 'Antacids again', null)))).toThrow('A02A appears more than once');
    });
});
