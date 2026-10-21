import { encounterCode, encounterNumberIn } from './encounter-codes';

describe('encounterCode', () => {
    it('pads the number to 5 digits after the two-digit year', () => {
        expect(encounterCode(476, new Date('2026-10-17T09:00:00Z'))).toBe('ENC-26-00476');
    });

    it('grows past 5 digits instead of wrapping', () => {
        expect(encounterCode(123456, new Date('2026-10-17T09:00:00Z'))).toBe('ENC-26-123456');
    });

    it("takes the year in Lagos time: 00:30 on 1 January in Lagos is still 31 December in UTC", () => {
        expect(encounterCode(1, new Date('2026-12-31T23:30:00Z'))).toBe('ENC-27-00001');
    });
});

describe('encounterNumberIn', () => {
    it('reads the number from a code, in any case, padded or not', () => {
        expect(encounterNumberIn('ENC-26-00476')).toBe(476);
        expect(encounterNumberIn(' enc-26-476 ')).toBe(476);
    });

    it('is null for names, bare numbers and partial codes', () => {
        expect(encounterNumberIn('Okafor')).toBeNull();
        expect(encounterNumberIn('476')).toBeNull();
        expect(encounterNumberIn('ENC-476')).toBeNull();
    });
});
