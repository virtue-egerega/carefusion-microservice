import { parseMedicines, useName } from './medicines-file';

const VALUES = {
    dosageForms: ['TABLET', 'CAPSULE', 'INJECTION', 'MEDICINAL_GAS'],
    routes: ['ORAL', 'PARENTERAL', 'INHALATION'],
    bodySystems: ['CENTRAL_NERVOUS_SYSTEM', 'CARDIOVASCULAR', 'RESPIRATORY'],
    legalCategories: ['POM', 'P', 'OTC'],
};
const SOURCE = { source_system: 'NHIA_MEDICINES_LIST', source_url: 'https://www.nhia.gov.ng/nhia-drug-list-and-prices/' };
const paracetamol = (extra: object = {}) => ({
    generic_name: 'Paracetamol', dosage_form: 'TABLET', route: 'ORAL', strength: '500 mg', presentation: 'Tablet',
    aliases: ['Acetaminophen'], ingredients: ['Paracetamol'], therapeutic_uses: ['PAIN', 'FEVER'], body_systems: ['CENTRAL_NERVOUS_SYSTEM'],
    atc_code: 'N02BE01', legal_category: null, controlled: null, nhis_code: 'NHIS-02-03-02', ...SOURCE, ...extra,
});
const file = (name: string, ...medicines: object[]) => ({ name, json: { medicines } });
const parse = (...medicines: object[]) => parseMedicines([file('batch-1', ...medicines)], VALUES);

describe('useName', () => {
    it('turns a use code into what staff see', () => {
        expect(useName('GENERAL_ANAESTHESIA')).toBe('General anaesthesia');
        expect(useName('PAIN')).toBe('Pain');
    });
});

describe('parseMedicines', () => {
    it('reads an entry into a row', () => {
        expect(parse(paracetamol())).toEqual([{
            genericName: 'Paracetamol', dosageForm: 'TABLET', route: 'ORAL', ingredients: ['Paracetamol'], aliases: ['Acetaminophen'],
            therapeuticUses: ['PAIN', 'FEVER'], bodySystems: ['CENTRAL_NERVOUS_SYSTEM'], atcCode: 'N02BE01', legalCategory: 'POM', controlled: null,
            strengths: ['500 mg'], presentations: ['Tablet'], nhisCodes: ['NHIS-02-03-02'], description: null,
            sourceSystem: 'NHIA_MEDICINES_LIST', sourceUrl: SOURCE.source_url,
        }]);
    });

    it('takes any use code, since the seeder creates the uses', () => {
        expect(parse(paracetamol({ therapeutic_uses: ['OXYGEN_THERAPY', 'GENERAL_ANAESTHESIA'] }))[0].therapeuticUses)
            .toEqual(['OXYGEN_THERAPY', 'GENERAL_ANAESTHESIA']);
    });

    it('keeps listed strengths and strength options as the strengths the source lists', () => {
        const [row] = parse(paracetamol({ strength: null, strength_options: ['50 mg/mL in 10 mL', '100 mg/mL in 5 mL'] }));
        expect(row.strengths).toEqual(['50 mg/mL in 10 mL', '100 mg/mL in 5 mL']);
    });

    it('defaults the ingredients to the generic name, and the legal category to POM', () => {
        expect(parse(paracetamol({ ingredients: undefined, legal_category: undefined }))[0]).toMatchObject({ ingredients: ['Paracetamol'], legalCategory: 'POM' });
    });

    it("keeps controlled as unknown when the source doesn't say", () => {
        expect(parse(paracetamol())[0].controlled).toBeNull();
        expect(parse(paracetamol({ controlled: true }))[0].controlled).toBe(true);
    });

    it('treats the same name in another case, form and route as one medicine, combining their lists', () => {
        const rows = parseMedicines([
            file('batch-1', paracetamol()),
            file('batch-2', paracetamol({ generic_name: 'PARACETAMOL', strength: '100 mg', nhis_code: 'NHIS-02-03-09', aliases: ['PCM'], therapeutic_uses: ['PAIN', 'HEADACHE'] })),
        ], VALUES);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            genericName: 'Paracetamol', strengths: ['500 mg', '100 mg'], nhisCodes: ['NHIS-02-03-02', 'NHIS-02-03-09'],
            aliases: ['Acetaminophen', 'PCM'], therapeuticUses: ['PAIN', 'FEVER', 'HEADACHE'],
        });
    });

    it('lets a later entry fill a value the first left out', () => {
        const [row] = parse(paracetamol(), paracetamol({ legal_category: 'OTC', controlled: false }));
        expect(row).toMatchObject({ legalCategory: 'OTC', controlled: false });
    });

    it('refuses entries for one medicine that disagree', () => {
        expect(() => parse(paracetamol(), paracetamol({ atc_code: 'N02BE51' })))
            .toThrow('batch-1 entry 2 (Paracetamol): same medicine as batch-1 entry 1 (Paracetamol), but a different atcCode');
    });

    it('keeps another form or route as another medicine', () => {
        expect(parse(paracetamol(), paracetamol({ dosage_form: 'INJECTION', route: 'PARENTERAL' }))).toHaveLength(2);
    });

    it('refuses a file without the medicines list', () => {
        expect(() => parseMedicines([{ name: 'batch-1', json: { drugs: [] } }], VALUES)).toThrow('batch-1: expected { "medicines"');
    });

    it('reports every problem in every file at once', () => {
        expect(() => parseMedicines([
            file('batch-1', paracetamol({ dosage_form: 'TABLET_OR_CAPSULE', therapeutic_uses: ['Pain', 'FEVER'] })),
            file('batch-2', paracetamol({ generic_name: '', route: null, body_systems: ['RESPIRATORY_SYSTEM'], controlled: 'yes' })),
        ], VALUES)).toThrow(new RegExp([
            '6 problem\\(s\\)',
            'batch-1 entry 1 \\(Paracetamol\\): dosage_form "TABLET_OR_CAPSULE" is not one of the allowed values',
            'therapeutic_uses must be codes like GENERAL_ANAESTHESIA: Pain',
            'batch-2 entry 1 \\(\\?\\): generic_name is required',
            'route is required',
            'controlled must be true, false or null',
            'body_systems has unknown value\\(s\\): RESPIRATORY_SYSTEM',
        ].join('[\\s\\S]*')));
    });
});
