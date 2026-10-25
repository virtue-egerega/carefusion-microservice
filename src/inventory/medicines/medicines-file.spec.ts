import { medicineKey, parseMedicines, useName } from './medicines-file';

const VALUES = {
    dosageForms: ['TABLET', 'CAPSULE', 'INJECTION', 'MEDICINAL_GAS'],
    routes: ['ORAL', 'PARENTERAL', 'INHALATION'],
    bodySystems: ['CENTRAL_NERVOUS_SYSTEM', 'CARDIOVASCULAR', 'RESPIRATORY'],
    legalCategories: ['POM', 'P', 'OTC'],
};
const SOURCE = { source_system: 'NHIA_MEDICINES_LIST', source_url: 'https://www.nhia.gov.ng/nhia-drug-list-and-prices/' };
const paracetamol = (extra: object = {}) => ({
    generic_name: 'Paracetamol', strength: '500 mg', dosage_form: 'TABLET', route: 'ORAL', presentation: 'Tablet',
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

describe('medicineKey', () => {
    it('ignores the case of the name and strength', () => {
        expect(medicineKey({ genericName: 'Paracetamol', strength: '500 MG', dosageForm: 'TABLET', route: 'ORAL' }))
            .toBe(medicineKey({ genericName: 'PARACETAMOL', strength: '500 mg', dosageForm: 'TABLET', route: 'ORAL' }));
    });

    it('tells strengths apart, and a missing strength from any strength', () => {
        const key = (strength: string | null) => medicineKey({ genericName: 'Oxygen', strength, dosageForm: 'MEDICINAL_GAS', route: 'INHALATION' });
        expect(key('500 mg')).not.toBe(key('1 g'));
        expect(key(null)).not.toBe(key('100%'));
    });
});

describe('parseMedicines', () => {
    it('reads an entry into one medicine', () => {
        expect(parse(paracetamol())).toEqual([{
            genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'TABLET', route: 'ORAL', presentation: 'Tablet',
            ingredients: ['Paracetamol'], aliases: ['Acetaminophen'], therapeuticUses: ['PAIN', 'FEVER'], bodySystems: ['CENTRAL_NERVOUS_SYSTEM'],
            atcCode: 'N02BE01', legalCategory: 'POM', controlled: null, nhisCode: 'NHIS-02-03-02', description: null,
            sourceSystem: 'NHIA_MEDICINES_LIST', sourceUrl: SOURCE.source_url,
        }]);
    });

    it('keeps each strength as its own medicine, in name then strength order', () => {
        const rows = parse(
            paracetamol({ generic_name: 'Allopurinol', strength: '300 mg', nhis_code: 'NHIS-02-04-02' }),
            paracetamol({ generic_name: 'Allopurinol', strength: '100 mg', nhis_code: 'NHIS-02-04-01' }),
        );
        expect(rows.map(r => [r.strength, r.nhisCode])).toEqual([['100 mg', 'NHIS-02-04-01'], ['300 mg', 'NHIS-02-04-02']]);
    });

    it('accepts a medicine with no strength, such as a medical gas', () => {
        expect(parse(paracetamol({ generic_name: 'Oxygen', strength: null, dosage_form: 'MEDICINAL_GAS', route: 'INHALATION' }))[0].strength).toBeNull();
    });

    it('takes any use code, since the seeder creates the uses', () => {
        expect(parse(paracetamol({ therapeutic_uses: ['OXYGEN_THERAPY', 'GENERAL_ANAESTHESIA'] }))[0].therapeuticUses)
            .toEqual(['OXYGEN_THERAPY', 'GENERAL_ANAESTHESIA']);
    });

    it('defaults the ingredients to the generic name, and the legal category to POM', () => {
        expect(parse(paracetamol({ ingredients: undefined, legal_category: undefined }))[0]).toMatchObject({ ingredients: ['Paracetamol'], legalCategory: 'POM' });
    });

    it("keeps controlled as unknown when the source doesn't say", () => {
        expect(parse(paracetamol())[0].controlled).toBeNull();
        expect(parse(paracetamol({ controlled: true }))[0].controlled).toBe(true);
    });

    it('refuses the same medicine twice, in one file or across files, whatever the case', () => {
        expect(() => parseMedicines([
            file('batch-1', paracetamol()),
            file('batch-2', paracetamol({ generic_name: 'PARACETAMOL', strength: '500 MG' })),
        ], VALUES)).toThrow('batch-2 entry 1 (PARACETAMOL): same medicine (name, strength, form and route) as batch-1 entry 1 (Paracetamol)');
    });

    it('refuses strength options: each strength is its own entry', () => {
        expect(() => parse(paracetamol({ strength: null, strength_options: ['50 mg/mL', '100 mg/mL'] })))
            .toThrow('strength_options: make one entry per strength instead');
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
