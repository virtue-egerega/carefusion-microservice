import { BodySystem } from '@shared/enums/consultations/consultation.enums';
import { REVIEW_OF_SYSTEMS, ROS_SYMPTOMS } from './review-of-systems.catalog';

// Notes store the codes, so the list must stay consistent as it grows
describe('review-of-systems catalog', () => {
    const symptoms = REVIEW_OF_SYSTEMS.flatMap(s => s.symptoms);

    it('gives every symptom a unique code', () => {
        expect(ROS_SYMPTOMS.size).toBe(symptoms.length);
    });

    it('uses stable upper-case codes, with a label and a clinical term', () => {
        for (const s of symptoms) {
            expect(s.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
            expect(s.label.trim()).not.toBe('');
            expect(s.term.trim()).not.toBe('');
        }
    });

    it('lists each body system once, using the database enum, never OTHER', () => {
        const systems = REVIEW_OF_SYSTEMS.map(s => s.system);
        expect(new Set(systems).size).toBe(systems.length);
        for (const system of systems) {
            expect(Object.values(BodySystem)).toContain(system);
            expect(system).not.toBe(BodySystem.OTHER);
        }
    });

    it('covers the 14 review-of-systems groups, with breast kept apart from skin', () => {
        expect(REVIEW_OF_SYSTEMS.map(s => s.system)).toEqual([
            'CONSTITUTIONAL', 'EYES', 'ENT', 'CARDIOVASCULAR', 'RESPIRATORY', 'GASTROINTESTINAL', 'GENITOURINARY',
            'MUSCULOSKELETAL', 'SKIN', 'BREAST', 'NEUROLOGICAL', 'PSYCHIATRIC', 'ENDOCRINE', 'HAEMATOLOGICAL_LYMPHATIC',
            'ALLERGIC_IMMUNOLOGICAL',
        ]);
    });

    it('marks menstrual and obstetric symptoms female', () => {
        for (const s of symptoms.filter(s => s.reproductive)) expect(s.sex).toBe('FEMALE');
    });
});
