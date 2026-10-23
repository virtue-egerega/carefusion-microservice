// The review-of-systems symptom list (PRD 14 §3.3), defined by CareFusion like the department and
// queue catalog. Grouped by body system in the order the screen shows them.
//
// `code` is what a note stores: never change or reuse one. Reword `label` / `term` freely. Retire a
// symptom with `retired: true` rather than deleting it, so old notes still show it.
// Who a symptom applies to: `sex`, `children` (the children's history applies, 14 §3.8), or
// `reproductive` (the women's history applies: menstrual and obstetric symptoms).

export type RosSymptom = {
    code: string;
    label: string;          // plain words, for the screen: "Coughing up blood"
    term: string;           // the clinical term, for the printed note: "Haemoptysis"
    sex?: 'FEMALE' | 'MALE';
    children?: true;
    reproductive?: true;
    retired?: true;
};

export type RosSystem = { system: string; label: string; symptoms: RosSymptom[] };

export const REVIEW_OF_SYSTEMS: RosSystem[] = [
    {
        system: 'CONSTITUTIONAL', label: 'General / constitutional',
        symptoms: [
            { code: 'FEVER',                  label: 'Fever',                              term: 'Pyrexia' },
            { code: 'CHILLS',                 label: 'Chills or shivering',                term: 'Rigors' },
            { code: 'NIGHT_SWEATS',           label: 'Night sweats',                       term: 'Night sweats' },
            { code: 'FATIGUE',                label: 'Tiredness',                          term: 'Fatigue' },
            { code: 'MALAISE',                label: 'Feeling generally unwell or weak',   term: 'Malaise' },
            { code: 'WEIGHT_LOSS',            label: 'Weight loss',                        term: 'Weight loss' },
            { code: 'WEIGHT_GAIN',            label: 'Weight gain',                        term: 'Weight gain' },
            { code: 'LOSS_OF_APPETITE',       label: 'Loss of appetite',                   term: 'Anorexia' },
            { code: 'POOR_FEEDING',           label: 'Poor feeding',                       term: 'Poor feeding',     children: true },
            { code: 'IRRITABILITY',           label: 'Excessive crying or irritability',   term: 'Irritability',     children: true },
            { code: 'NOT_GAINING_WEIGHT',     label: 'Not gaining weight',                 term: 'Faltering growth', children: true },
        ],
    },
    {
        system: 'EYES', label: 'Eyes',
        symptoms: [
            { code: 'BLURRED_VISION',         label: 'Blurred vision',                     term: 'Blurred vision' },
            { code: 'VISION_LOSS',            label: 'Loss of vision',                     term: 'Visual loss' },
            { code: 'DOUBLE_VISION',          label: 'Double vision',                      term: 'Diplopia' },
            { code: 'EYE_PAIN',               label: 'Eye pain',                           term: 'Ocular pain' },
            { code: 'RED_EYE',                label: 'Red eye',                            term: 'Red eye' },
            { code: 'EYE_DISCHARGE',          label: 'Discharge from the eye',             term: 'Ocular discharge' },
            { code: 'ITCHY_EYES',             label: 'Itchy eyes',                         term: 'Ocular pruritus' },
            { code: 'LIGHT_SENSITIVITY',      label: 'Sensitivity to light',               term: 'Photophobia' },
        ],
    },
    {
        system: 'ENT', label: 'Ears, nose, mouth and throat',
        symptoms: [
            { code: 'EAR_PAIN',               label: 'Ear pain',                           term: 'Otalgia' },
            { code: 'EAR_DISCHARGE',          label: 'Discharge from the ear',             term: 'Otorrhoea' },
            { code: 'HEARING_LOSS',           label: 'Hearing loss',                       term: 'Hearing loss' },
            { code: 'RINGING_IN_EARS',        label: 'Ringing in the ears',                term: 'Tinnitus' },
            { code: 'BLOCKED_NOSE',           label: 'Blocked nose',                       term: 'Nasal congestion' },
            { code: 'RUNNY_NOSE',             label: 'Runny nose',                         term: 'Rhinorrhoea' },
            { code: 'NOSEBLEED',              label: 'Nosebleed',                          term: 'Epistaxis' },
            { code: 'SORE_THROAT',            label: 'Sore throat',                        term: 'Sore throat' },
            { code: 'HOARSE_VOICE',           label: 'Hoarse voice',                       term: 'Dysphonia' },
            { code: 'MOUTH_ULCERS',           label: 'Mouth ulcers',                       term: 'Oral ulceration' },
            { code: 'TOOTHACHE',              label: 'Toothache',                          term: 'Dental pain' },
        ],
    },
    {
        system: 'CARDIOVASCULAR', label: 'Cardiovascular',
        symptoms: [
            { code: 'CHEST_PAIN',             label: 'Chest pain',                         term: 'Chest pain' },
            { code: 'PALPITATIONS',           label: 'Palpitations',                       term: 'Palpitations' },
            { code: 'LEG_SWELLING',           label: 'Leg swelling',                       term: 'Peripheral oedema' },
            { code: 'FAINTING',               label: 'Fainting',                           term: 'Syncope' },
            { code: 'BREATHLESS_LYING_FLAT',  label: 'Breathless lying flat',              term: 'Orthopnoea' },
            { code: 'WAKING_BREATHLESS',      label: 'Waking up breathless at night',      term: 'Paroxysmal nocturnal dyspnoea' },
            { code: 'LEG_PAIN_ON_WALKING',    label: 'Leg pain on walking',                term: 'Intermittent claudication' },
        ],
    },
    {
        system: 'RESPIRATORY', label: 'Respiratory',
        symptoms: [
            { code: 'COUGH',                  label: 'Cough',                              term: 'Cough' },
            { code: 'SPUTUM',                 label: 'Coughing up phlegm',                 term: 'Sputum production' },
            { code: 'HAEMOPTYSIS',            label: 'Coughing up blood',                  term: 'Haemoptysis' },
            { code: 'BREATHLESSNESS',         label: 'Breathlessness',                     term: 'Dyspnoea' },
            { code: 'WHEEZE',                 label: 'Wheezing',                           term: 'Wheeze' },
            { code: 'CHEST_TIGHTNESS',        label: 'Chest tightness',                    term: 'Chest tightness' },
            { code: 'NOISY_BREATHING',        label: 'Noisy breathing in',                 term: 'Stridor' },
            { code: 'FAST_BREATHING',         label: 'Fast breathing',                     term: 'Tachypnoea',       children: true },
        ],
    },
    {
        system: 'GASTROINTESTINAL', label: 'Gastrointestinal',
        symptoms: [
            { code: 'NAUSEA',                 label: 'Nausea',                             term: 'Nausea' },
            { code: 'VOMITING',               label: 'Vomiting',                           term: 'Vomiting' },
            { code: 'HAEMATEMESIS',           label: 'Vomiting blood',                     term: 'Haematemesis' },
            { code: 'ABDOMINAL_PAIN',         label: 'Abdominal pain',                     term: 'Abdominal pain' },
            { code: 'ABDOMINAL_SWELLING',     label: 'Abdominal swelling',                 term: 'Abdominal distension' },
            { code: 'HEARTBURN',              label: 'Heartburn or indigestion',           term: 'Dyspepsia' },
            { code: 'DIFFICULTY_SWALLOWING',  label: 'Difficulty swallowing',              term: 'Dysphagia' },
            { code: 'DIARRHOEA',              label: 'Diarrhoea',                          term: 'Diarrhoea' },
            { code: 'CONSTIPATION',           label: 'Constipation',                       term: 'Constipation' },
            { code: 'BLOOD_IN_STOOL',         label: 'Blood in the stool',                 term: 'Haematochezia' },
            { code: 'BLACK_STOOL',            label: 'Black, tarry stool',                 term: 'Melaena' },
            { code: 'YELLOW_EYES_OR_SKIN',    label: 'Yellow eyes or skin',                term: 'Jaundice' },
        ],
    },
    {
        system: 'GENITOURINARY', label: 'Genitourinary',
        symptoms: [
            { code: 'PAINFUL_URINATION',      label: 'Pain passing urine',                 term: 'Dysuria' },
            { code: 'FREQUENT_URINATION',     label: 'Passing urine often',                term: 'Urinary frequency' },
            { code: 'URINARY_URGENCY',        label: 'Urgent need to pass urine',          term: 'Urinary urgency' },
            { code: 'NIGHT_URINATION',        label: 'Waking at night to pass urine',      term: 'Nocturia' },
            { code: 'BLOOD_IN_URINE',         label: 'Blood in the urine',                 term: 'Haematuria' },
            { code: 'REDUCED_URINE',          label: 'Passing little urine',               term: 'Oliguria' },
            { code: 'LEAKING_URINE',          label: 'Leaking urine',                      term: 'Urinary incontinence' },
            { code: 'GENITAL_SORES',          label: 'Genital sores',                      term: 'Genital ulceration' },
            { code: 'WEAK_URINE_STREAM',      label: 'Weak urine stream',                  term: 'Poor urinary stream',        sex: 'MALE' },
            { code: 'URETHRAL_DISCHARGE',     label: 'Discharge from the penis',           term: 'Urethral discharge',         sex: 'MALE' },
            { code: 'TESTICULAR_PAIN',        label: 'Testicular pain or swelling',        term: 'Scrotal pain or swelling',   sex: 'MALE' },
            { code: 'VAGINAL_DISCHARGE',      label: 'Vaginal discharge',                  term: 'Vaginal discharge',          sex: 'FEMALE' },
            { code: 'ABNORMAL_VAGINAL_BLEEDING', label: 'Bleeding between periods or after sex', term: 'Abnormal vaginal bleeding', sex: 'FEMALE', reproductive: true },
            { code: 'PAINFUL_PERIODS',        label: 'Painful periods',                    term: 'Dysmenorrhoea',              sex: 'FEMALE', reproductive: true },
            { code: 'HEAVY_PERIODS',          label: 'Heavy periods',                      term: 'Menorrhagia',                sex: 'FEMALE', reproductive: true },
            { code: 'IRREGULAR_PERIODS',      label: 'Irregular periods',                  term: 'Irregular menstruation',     sex: 'FEMALE', reproductive: true },
            { code: 'PELVIC_PAIN',            label: 'Pelvic pain',                        term: 'Pelvic pain',                sex: 'FEMALE' },
            { code: 'PAINFUL_SEX',            label: 'Pain during sex',                    term: 'Dyspareunia',                sex: 'FEMALE', reproductive: true },
        ],
    },
    {
        system: 'MUSCULOSKELETAL', label: 'Musculoskeletal',
        symptoms: [
            { code: 'JOINT_PAIN',             label: 'Joint pain',                         term: 'Arthralgia' },
            { code: 'JOINT_SWELLING',         label: 'Joint swelling',                     term: 'Joint swelling' },
            { code: 'MORNING_STIFFNESS',      label: 'Stiffness in the morning',           term: 'Morning stiffness' },
            { code: 'REDUCED_MOVEMENT',       label: 'Difficulty moving a joint',          term: 'Reduced range of movement' },
            { code: 'BACK_PAIN',              label: 'Back pain',                          term: 'Back pain' },
            { code: 'NECK_PAIN',              label: 'Neck pain',                          term: 'Neck pain' },
            { code: 'MUSCLE_PAIN',            label: 'Muscle pain',                        term: 'Myalgia' },
            { code: 'MUSCLE_CRAMPS',          label: 'Muscle cramps',                      term: 'Muscle cramps' },
        ],
    },
    {
        system: 'SKIN', label: 'Skin',
        symptoms: [
            { code: 'RASH',                   label: 'Rash',                               term: 'Rash' },
            { code: 'ITCHING',                label: 'Itching',                            term: 'Pruritus' },
            { code: 'SKIN_LUMP',              label: 'Lump or spot on the skin',           term: 'Skin lesion' },
            { code: 'CHANGING_MOLE',          label: 'A mole that has changed',            term: 'Changing naevus' },
            { code: 'NON_HEALING_WOUND',      label: "A wound or ulcer that won't heal",   term: 'Non-healing ulcer' },
            { code: 'SKIN_COLOUR_CHANGE',     label: 'Change in skin colour',              term: 'Pigmentation change' },
            { code: 'HAIR_LOSS',              label: 'Hair loss',                          term: 'Alopecia' },
            { code: 'NAIL_CHANGES',           label: 'Nail changes',                       term: 'Nail changes' },
        ],
    },
    {
        system: 'BREAST', label: 'Breast',
        symptoms: [
            { code: 'BREAST_LUMP',            label: 'Breast lump',                        term: 'Breast lump' },
            { code: 'BREAST_PAIN',            label: 'Breast pain',                        term: 'Mastalgia' },
            { code: 'NIPPLE_DISCHARGE',       label: 'Discharge from the nipple',          term: 'Nipple discharge' },
            { code: 'NIPPLE_CHANGE',          label: 'Nipple turned in or changed',        term: 'Nipple inversion or change' },
            { code: 'BREAST_SKIN_CHANGE',     label: 'Skin changes on the breast',         term: 'Breast skin changes' },
        ],
    },
    {
        system: 'NEUROLOGICAL', label: 'Neurological',
        symptoms: [
            { code: 'HEADACHE',               label: 'Headache',                           term: 'Headache' },
            { code: 'DIZZINESS',              label: 'Dizziness or light-headedness',      term: 'Dizziness' },
            { code: 'VERTIGO',                label: 'Room spinning',                      term: 'Vertigo' },
            { code: 'LIMB_WEAKNESS',          label: 'Weakness of an arm or leg',          term: 'Focal weakness' },
            { code: 'NUMBNESS_TINGLING',      label: 'Numbness or tingling',               term: 'Paraesthesia' },
            { code: 'LOSS_OF_CONSCIOUSNESS',  label: 'Loss of consciousness',              term: 'Loss of consciousness' },
            { code: 'SEIZURES',               label: 'Seizures or fits',                   term: 'Seizures' },
            { code: 'TREMOR',                 label: 'Shaking',                            term: 'Tremor' },
            { code: 'SPEECH_DIFFICULTY',      label: 'Difficulty speaking',                term: 'Speech disturbance' },
            { code: 'UNSTEADY_WALKING',       label: 'Unsteady walking',                   term: 'Gait disturbance' },
            { code: 'CONFUSION',              label: 'Confusion or memory problems',       term: 'Confusion or memory impairment' },
            { code: 'STIFF_NECK',             label: 'Stiff neck',                         term: 'Neck stiffness' },
        ],
    },
    {
        system: 'PSYCHIATRIC', label: 'Psychiatric',
        symptoms: [
            { code: 'LOW_MOOD',               label: 'Low mood',                           term: 'Depressed mood' },
            { code: 'LOSS_OF_INTEREST',       label: 'Loss of interest or pleasure',       term: 'Anhedonia' },
            { code: 'ANXIETY',                label: 'Worry or anxiety',                   term: 'Anxiety' },
            { code: 'POOR_SLEEP',             label: 'Difficulty sleeping',                term: 'Insomnia' },
            { code: 'POOR_CONCENTRATION',     label: 'Poor concentration',                 term: 'Poor concentration' },
            { code: 'SELF_HARM_THOUGHTS',     label: 'Thoughts of self-harm or suicide',   term: 'Suicidal ideation' },
            { code: 'HALLUCINATIONS',         label: "Hearing or seeing things others don't", term: 'Hallucinations' },
        ],
    },
    {
        system: 'ENDOCRINE', label: 'Endocrine',
        symptoms: [
            { code: 'EXCESSIVE_THIRST',       label: 'Excessive thirst',                   term: 'Polydipsia' },
            { code: 'PASSING_MUCH_URINE',     label: 'Passing large amounts of urine',     term: 'Polyuria' },
            { code: 'EXCESSIVE_HUNGER',       label: 'Excessive hunger',                   term: 'Polyphagia' },
            { code: 'HEAT_INTOLERANCE',       label: 'Feeling too hot',                    term: 'Heat intolerance' },
            { code: 'COLD_INTOLERANCE',       label: 'Feeling too cold',                   term: 'Cold intolerance' },
            { code: 'EXCESSIVE_SWEATING',     label: 'Excessive sweating',                 term: 'Hyperhidrosis' },
            { code: 'NECK_SWELLING',          label: 'Swelling at the front of the neck',  term: 'Goitre' },
        ],
    },
    {
        system: 'HAEMATOLOGICAL_LYMPHATIC', label: 'Blood and lymph',
        symptoms: [
            { code: 'LOOKING_PALE',           label: 'Looking pale',                       term: 'Pallor' },
            { code: 'EASY_BRUISING',          label: 'Bruising easily',                    term: 'Easy bruising' },
            { code: 'PROLONGED_BLEEDING',     label: "Bleeding that won't stop",           term: 'Prolonged bleeding' },
            { code: 'SWOLLEN_GLANDS',         label: 'Swollen glands',                     term: 'Lymphadenopathy' },
            { code: 'PAINFUL_CRISES',         label: 'Painful crises (sickle cell)',       term: 'Vaso-occlusive crises' },
        ],
    },
    {
        system: 'ALLERGIC_IMMUNOLOGICAL', label: 'Allergy and immunity',
        symptoms: [
            { code: 'SNEEZING',               label: 'Sneezing or hay fever',              term: 'Allergic rhinitis' },
            { code: 'HIVES',                  label: 'Hives',                              term: 'Urticaria' },
            { code: 'LIP_OR_FACE_SWELLING',   label: 'Swelling of the lips or face',       term: 'Angioedema' },
            { code: 'FREQUENT_INFECTIONS',    label: 'Frequent infections',                term: 'Recurrent infections' },
        ],
    },
];

/** Every symptom by code, with its body system. */
export const ROS_SYMPTOMS = new Map(
    REVIEW_OF_SYSTEMS.flatMap(({ system, symptoms }) => symptoms.map(symptom => [symptom.code, { ...symptom, system }] as const)),
);
