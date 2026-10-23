import { BodySystem } from '@shared/enums/consultations/consultation.enums';
import { EXAM_ELEMENTS, EXAMINATION } from './examination.catalog';

// Notes store the codes, so the list must stay consistent as it grows
describe('examination catalog', () => {
    const elements = EXAMINATION.flatMap(s => s.elements);

    it('gives every item a unique code', () => {
        expect(EXAM_ELEMENTS.size).toBe(elements.length);
    });

    it('uses stable upper-case codes, with a label and a hint', () => {
        for (const e of elements) {
            expect(e.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
            expect(e.label.trim()).not.toBe('');
            expect(e.hint.trim()).not.toBe('');
        }
    });

    it('lists each body system once, using the database enum, never OTHER', () => {
        const systems = EXAMINATION.map(s => s.system);
        expect(new Set(systems).size).toBe(systems.length);
        for (const system of systems) {
            expect(Object.values(BodySystem)).toContain(system);
            expect(system).not.toBe(BodySystem.OTHER);
        }
    });

    it('asks for a chaperone on intimate examinations', () => {
        for (const code of ['DIGITAL_RECTAL', 'BREAST_INSPECTION', 'BREAST_PALPATION', 'EXTERNAL_GENITALIA', 'SCROTUM_TESTES', 'SPECULUM', 'BIMANUAL']) {
            expect(EXAM_ELEMENTS.get(code)?.hint).toMatch(/chaperone/);
        }
    });

    it('marks the women-only examinations female', () => {
        for (const e of elements.filter(e => e.reproductive)) expect(e.sex).toBe('FEMALE');
    });
});
