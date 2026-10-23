import { codeRangeWhere, parseIcd10Chapters, parseIcd10Codes, parseIcd10Groups } from './icd10-file';

// Lines as they appear in WHO's ICD-10 2019 plain text tabular files
const CHAPTERS = '01;Certain infectious and parasitic diseases\r\n02;Neoplasms\r\n03;Diseases of the blood\r\n04;Endocrine, nutritional and metabolic diseases\r\n';
const GROUPS = 'A00;A09;01;Intestinal infectious diseases\r\nA15;A19;01;Tuberculosis\r\nU82;U85;22;Resistance to antimicrobial and antineoplastic drugs\r\n';
const CODES = [
    '3;N;X;01;B50;B50.-;B50;B50;Plasmodium falciparum malaria;Plasmodium falciparum malaria;;;043;4-013;3-014;2-020;1-021',
    '4;T;X;01;B50;B50.9;B50.9;B509;Plasmodium falciparum malaria, unspecified;Plasmodium falciparum malaria;Plasmodium falciparum malaria, unspecified;;043;4-013;3-014;2-020;1-021',
    '3;T;X;01;A30;A33;A33;A33;Tetanus neonatorum;Tetanus neonatorum;;;012;4-004;3-005;2-007;1-008',
    '4;T;X;03;D60;D63.0*;D63.0;D630;Anaemia in neoplastic disease;Anaemia in chronic diseases classified elsewhere;Anaemia in neoplastic disease;;055;4-015;3-017;2-024;1-025',
    '5;T;S;01;B15;B18.00;B18.00;B1800;Chronic viral hepatitis B with delta-agent: immune-tolerant phase;Chronic viral hepatitis;Chronic viral hepatitis B with delta-agent;immune-tolerant phase;038;4-012;3-013;2-018;1-019',
    '4;T;S;04;E10;E10.0;E10.0;E100;Type 1 diabetes mellitus: With coma;Type 1 diabetes mellitus;With coma;;104;4-044;3-025;2-046;1-052',
    '4;T;X;22;U00;U07.1;U07.1;U071;COVID-19, virus identified;Emergency use of U07;COVID-19, virus identified;;UNDEF;UNDEF;UNDEF;UNDEF;UNDEF',
].join('\r\n');

describe('parseIcd10Chapters', () => {
    it("reads the chapters in WHO's order, with their roman numerals", () => {
        const chapters = parseIcd10Chapters(CHAPTERS);
        expect(chapters[0]).toEqual({ number: '01', numeral: 'I', title: 'Certain infectious and parasitic diseases', position: 0 });
        expect(chapters[3]).toMatchObject({ number: '04', numeral: 'IV' });
    });

    it('refuses a chapter number past XXII', () => {
        expect(() => parseIcd10Chapters('23;Unknown')).toThrow('chapters file, line 1');
    });
});

describe('parseIcd10Groups', () => {
    it("reads each group's range, chapter and title in WHO's order", () => {
        const groups = parseIcd10Groups(GROUPS);
        expect(groups[0]).toEqual({ firstCode: 'A00', lastCode: 'A09', chapter: '01', title: 'Intestinal infectious diseases', position: 0 });
        expect(groups[2]).toMatchObject({ firstCode: 'U82', chapter: '22', position: 2 });
    });

    it('refuses a line that is not the expected layout', () => {
        expect(() => parseIcd10Groups('A00;Cholera')).toThrow('groups file, line 1');
    });
});

describe('parseIcd10Codes', () => {
    const codes = parseIcd10Codes(CODES, parseIcd10Chapters(CHAPTERS));
    const byCode = new Map(codes.map(c => [c.code, c]));

    it('reads every line, with the dotted code, full title and chapter', () => {
        expect(codes).toHaveLength(7);
        expect(byCode.get('B50.9')).toEqual({
            code: 'B50.9', title: 'Plasmodium falciparum malaria, unspecified', chapter: 'I Certain infectious and parasitic diseases', selectable: true,
        });
        expect(byCode.get('E10.0')?.title).toBe('Type 1 diabetes mellitus: With coma');
        expect(byCode.get('U07.1')?.chapter).toBeNull();   // chapter XXII isn't in this sample's chapters
    });

    it('keeps a heading with subdivisions, not selectable; a category without subdivisions is', () => {
        expect(byCode.get('B50')?.selectable).toBe(false);
        expect(byCode.get('A33')?.selectable).toBe(true);
    });

    it('takes the clean code, without dagger or asterisk marks, and reads five-character codes', () => {
        expect(byCode.has('D63.0')).toBe(true);
        expect(byCode.has('D63.0*')).toBe(false);
        expect(byCode.get('B18.00')?.selectable).toBe(true);
    });

    it('refuses a file that is not the expected layout', () => {
        expect(() => parseIcd10Codes('A00;Cholera', [])).toThrow('codes file, line 1: not the expected layout');
    });
});

describe('codeRangeWhere', () => {
    // the same test the database applies: code >= first AND (code <= last OR code starts with last)
    const holds = (code: string, first: string, last: string) => {
        const [{ code: { gte } }, { OR: [{ code: { lte } }, { code: { startsWith } }] }] = codeRangeWhere(first, last).AND as any;
        return code >= gte && (code <= lte || code.startsWith(startsWith));
    };

    it("holds every code from the first to the last, with the last one's subdivisions", () => {
        expect(holds('A00', 'A00', 'A09')).toBe(true);
        expect(holds('A01.1', 'A00', 'A09')).toBe(true);
        expect(holds('A09.9', 'A00', 'A09')).toBe(true);
        expect(holds('B18.00', 'B15', 'B19')).toBe(true);
    });

    it('leaves out codes either side', () => {
        expect(holds('A10', 'A00', 'A09')).toBe(false);
        expect(holds('Z99', 'A00', 'A09')).toBe(false);
        expect(holds('B20', 'B15', 'B19')).toBe(false);
    });
});
