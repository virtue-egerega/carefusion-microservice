import { generateTemporaryPassword } from './temporary-password';

describe('generateTemporaryPassword', () => {
    const samples = Array.from({ length: 500 }, () => generateTemporaryPassword());

    it('is 12 characters with every character class', () => {
        for (const p of samples) {
            expect(p).toHaveLength(12);
            expect(p).toMatch(/[A-Z]/);
            expect(p).toMatch(/[a-z]/);
            expect(p).toMatch(/[0-9]/);
            expect(p).toMatch(/[!@#$%&*]/);
        }
    });

    it('never uses look-alike characters, since it is read out or handed over', () => {
        for (const p of samples) expect(p).not.toMatch(/[0O1lI]/);
    });

    it('does not repeat', () => {
        expect(new Set(samples).size).toBe(samples.length);
    });
});
