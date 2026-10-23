// The systemic examination list (PRD 14 §4.2), defined by CareFusion like the review-of-systems list.
// Grouped by body system in the order of a standard systemic examination.
//
// `code` is what a note stores: never change or reuse one. Reword `label` / `hint` freely. Retire an
// item with `retired: true` rather than deleting it, so old notes still show it.
// Who an item applies to: `sex`, `children` (the children's history applies, 14 §3.8), or
// `reproductive` (the women's history applies).

export type ExamElement = {
    code: string;
    label: string;          // for the screen and the printed note: "Heart sounds"
    hint: string;           // what it covers, to guide the note: "S1, S2; added sounds; rubs"
    sex?: 'FEMALE' | 'MALE';
    children?: true;
    reproductive?: true;
    retired?: true;
};

export type ExamSystem = { system: string; label: string; elements: ExamElement[] };

const CHAPERONE = 'Record the chaperone in the note';

export const EXAMINATION: ExamSystem[] = [
    {
        system: 'CARDIOVASCULAR', label: 'Cardiovascular',
        elements: [
            { code: 'PULSE',               label: 'Pulse',                       hint: 'Rate, rhythm, volume, character' },
            { code: 'PERIPHERAL_PULSES',   label: 'Peripheral pulses',           hint: 'Radial, femoral, popliteal, foot pulses; radio-femoral delay' },
            { code: 'CAPILLARY_REFILL',    label: 'Capillary refill',            hint: 'Seconds' },
            { code: 'JVP',                 label: 'Jugular venous pressure',     hint: 'Raised or not; height above the sternal angle' },
            { code: 'APEX_BEAT',           label: 'Apex beat',                   hint: 'Position, character' },
            { code: 'HEAVES_THRILLS',      label: 'Heaves and thrills',          hint: 'Parasternal heave; palpable thrills' },
            { code: 'HEART_SOUNDS',        label: 'Heart sounds',                hint: 'S1, S2; added sounds (S3, S4); rubs' },
            { code: 'MURMURS',             label: 'Murmurs',                     hint: 'Timing, site, radiation, grade' },
        ],
    },
    {
        system: 'RESPIRATORY', label: 'Respiratory',
        elements: [
            { code: 'WORK_OF_BREATHING',   label: 'Work of breathing',           hint: 'Accessory muscles, nasal flaring, chest recession, grunting' },
            { code: 'CHEST_SHAPE',         label: 'Chest shape and movement',    hint: 'Deformity, symmetry of movement' },
            { code: 'TRACHEA',             label: 'Trachea',                     hint: 'Central or deviated' },
            { code: 'CHEST_EXPANSION',     label: 'Chest expansion',             hint: 'Equal or reduced, which side' },
            { code: 'PERCUSSION_NOTE',     label: 'Percussion note',             hint: 'Resonant, dull, stony dull, hyper-resonant; where' },
            { code: 'BREATH_SOUNDS',       label: 'Breath sounds',               hint: 'Vesicular, bronchial, reduced or absent; where' },
            { code: 'ADDED_SOUNDS',        label: 'Added sounds',                hint: 'Crackles, wheeze, pleural rub; where' },
            { code: 'VOCAL_RESONANCE',     label: 'Vocal resonance',             hint: 'Normal, increased, reduced' },
        ],
    },
    {
        system: 'GASTROINTESTINAL', label: 'Abdomen',
        elements: [
            { code: 'ABDOMEN_INSPECTION',  label: 'Inspection',                  hint: 'Distension, scars, visible veins, movement with breathing' },
            { code: 'ABDOMINAL_TENDERNESS', label: 'Tenderness',                 hint: 'Site; guarding, rebound, rigidity' },
            { code: 'LIVER',               label: 'Liver',                       hint: 'Size in cm below the costal margin, edge, tenderness' },
            { code: 'SPLEEN',              label: 'Spleen',                      hint: 'Size in cm below the costal margin' },
            { code: 'KIDNEYS',             label: 'Kidneys',                     hint: 'Ballotable or not' },
            { code: 'ABDOMINAL_MASSES',    label: 'Masses',                      hint: 'Site, size, consistency, mobility' },
            { code: 'ASCITES',             label: 'Ascites',                     hint: 'Shifting dullness, fluid thrill' },
            { code: 'BOWEL_SOUNDS',        label: 'Bowel sounds',                hint: 'Present, absent, increased' },
            { code: 'HERNIAL_ORIFICES',    label: 'Hernial orifices',            hint: 'Inguinal, femoral, umbilical' },
            { code: 'DIGITAL_RECTAL',      label: 'Digital rectal examination',  hint: `Tone, masses, prostate, blood. ${CHAPERONE}` },
        ],
    },
    {
        system: 'NEUROLOGICAL', label: 'Neurological',
        elements: [
            { code: 'CONSCIOUSNESS',       label: 'Level of consciousness',      hint: 'GCS (E, V, M) or AVPU' },
            { code: 'ORIENTATION',         label: 'Orientation',                 hint: 'Time, place, person' },
            { code: 'SPEECH',              label: 'Speech',                      hint: 'Dysarthria, dysphasia' },
            { code: 'CRANIAL_NERVES',      label: 'Cranial nerves',              hint: 'Which nerve, which side' },
            { code: 'TONE',                label: 'Tone',                        hint: 'Normal, increased, reduced; which limbs' },
            { code: 'POWER',               label: 'Power',                       hint: 'MRC grade 0–5 by muscle group' },
            { code: 'REFLEXES',            label: 'Reflexes',                    hint: 'Tendon reflexes; plantar response' },
            { code: 'SENSATION',           label: 'Sensation',                   hint: 'Light touch, pain, vibration, position; distribution' },
            { code: 'COORDINATION',        label: 'Coordination',                hint: 'Finger–nose, heel–shin, rapid alternating movements' },
            { code: 'GAIT',                label: 'Gait',                        hint: 'Pattern, balance, Romberg' },
            { code: 'MENINGEAL_SIGNS',     label: 'Meningeal signs',             hint: "Neck stiffness, Kernig's, Brudzinski's" },
            { code: 'FONTANELLE',          label: 'Anterior fontanelle',         hint: 'Flat, bulging, sunken; open or closed', children: true },
        ],
    },
    {
        system: 'MUSCULOSKELETAL', label: 'Musculoskeletal',
        elements: [
            { code: 'JOINT_INSPECTION',    label: 'Joints: look',                hint: 'Swelling, deformity, redness; which joints' },
            { code: 'JOINT_PALPATION',     label: 'Joints: feel',                hint: 'Warmth, tenderness, effusion' },
            { code: 'JOINT_MOVEMENT',      label: 'Joints: move',                hint: 'Active and passive range of movement' },
            { code: 'SPINE',               label: 'Spine',                       hint: 'Alignment, tenderness, movement' },
            { code: 'MUSCLES',             label: 'Muscles',                     hint: 'Wasting, tenderness' },
        ],
    },
    {
        system: 'SKIN', label: 'Skin',
        elements: [
            { code: 'SKIN_RASH',           label: 'Rash',                        hint: 'Distribution, morphology, colour' },
            { code: 'SKIN_LESIONS',        label: 'Lesions',                     hint: 'Type, size, site' },
            { code: 'SKIN_ULCERS',         label: 'Ulcers and wounds',           hint: 'Site, size, edge, base, discharge' },
            { code: 'HAIR_AND_NAILS',      label: 'Hair and nails',              hint: 'Hair loss, nail changes' },
        ],
    },
    {
        system: 'ENT', label: 'Ears, nose and throat',
        elements: [
            { code: 'EARS',                label: 'Ears',                        hint: 'Otoscopy: canal, tympanic membrane, discharge' },
            { code: 'NOSE',                label: 'Nose',                        hint: 'Mucosa, septum, discharge, polyps' },
            { code: 'MOUTH',               label: 'Mouth',                       hint: 'Mucosa, tongue, gums, teeth' },
            { code: 'THROAT',              label: 'Throat',                      hint: 'Tonsils, pharynx, exudate' },
        ],
    },
    {
        system: 'EYES', label: 'Eyes',
        elements: [
            { code: 'VISUAL_ACUITY',       label: 'Visual acuity',               hint: 'Each eye, with or without glasses' },
            { code: 'PUPILS',              label: 'Pupils',                      hint: 'Size, equality, reaction to light' },
            { code: 'CONJUNCTIVA_SCLERA',  label: 'Conjunctiva and sclera',      hint: 'Redness, discharge, pallor, jaundice' },
            { code: 'EYE_MOVEMENTS',       label: 'Eye movements',               hint: 'Full or restricted; nystagmus' },
            { code: 'FUNDOSCOPY',          label: 'Fundoscopy',                  hint: 'Discs, vessels, retina' },
        ],
    },
    {
        system: 'BREAST', label: 'Breast',
        elements: [
            { code: 'BREAST_INSPECTION',   label: 'Inspection',                  hint: `Symmetry, skin changes, nipples. ${CHAPERONE}` },
            { code: 'BREAST_PALPATION',    label: 'Palpation',                   hint: `Lumps: site, size, consistency, mobility; tenderness. ${CHAPERONE}` },
        ],
    },
    {
        system: 'GENITOURINARY', label: 'Genitourinary',
        elements: [
            { code: 'RENAL_ANGLE',         label: 'Renal angles',                hint: 'Tenderness' },
            { code: 'BLADDER',             label: 'Bladder',                     hint: 'Palpable, distended, suprapubic tenderness' },
            { code: 'EXTERNAL_GENITALIA',  label: 'External genitalia',          hint: `Lesions, discharge, swelling. ${CHAPERONE}` },
            { code: 'SCROTUM_TESTES',      label: 'Scrotum and testes',          hint: `Swelling, tenderness, both testes present. ${CHAPERONE}`, sex: 'MALE' },
            { code: 'SPECULUM',            label: 'Speculum examination',        hint: `Cervix, discharge, bleeding. ${CHAPERONE}`, sex: 'FEMALE', reproductive: true },
            { code: 'BIMANUAL',            label: 'Bimanual (vaginal) examination', hint: `Uterus size, adnexal masses, cervical excitation. ${CHAPERONE}`, sex: 'FEMALE', reproductive: true },
        ],
    },
    {
        system: 'PSYCHIATRIC', label: 'Mental state',
        elements: [
            { code: 'APPEARANCE_BEHAVIOUR', label: 'Appearance and behaviour',   hint: 'Self-care, eye contact, agitation' },
            { code: 'MENTAL_STATE_SPEECH', label: 'Speech',                      hint: 'Rate, volume, coherence' },
            { code: 'MOOD_AFFECT',         label: 'Mood and affect',             hint: "Patient's own words; observed affect" },
            { code: 'THOUGHT',             label: 'Thought',                     hint: 'Form and content; delusions; thoughts of self-harm' },
            { code: 'PERCEPTION',          label: 'Perception',                  hint: 'Hallucinations' },
            { code: 'COGNITION',           label: 'Cognition',                   hint: 'Attention, memory' },
            { code: 'INSIGHT',             label: 'Insight and judgement',       hint: 'Understands their illness and need for treatment' },
        ],
    },
    {
        system: 'ENDOCRINE', label: 'Thyroid',
        elements: [
            { code: 'THYROID',             label: 'Thyroid',                     hint: 'Size, nodules, tenderness, moves with swallowing' },
        ],
    },
    {
        system: 'HAEMATOLOGICAL_LYMPHATIC', label: 'Lymph nodes',
        elements: [
            { code: 'CERVICAL_NODES',      label: 'Cervical lymph nodes',        hint: 'Size, consistency, tenderness, matted or not' },
            { code: 'AXILLARY_NODES',      label: 'Axillary lymph nodes',        hint: 'Size, consistency, tenderness' },
            { code: 'INGUINAL_NODES',      label: 'Inguinal lymph nodes',        hint: 'Size, consistency, tenderness' },
        ],
    },
];

/** Every item by code, with its body system. */
export const EXAM_ELEMENTS = new Map(
    EXAMINATION.flatMap(({ system, elements }) => elements.map(element => [element.code, { ...element, system }] as const)),
);
