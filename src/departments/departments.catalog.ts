export type QueueEntry = { systemKey: string; name: string };
export type DeptEntry  = { systemKey: string; name: string; queues: QueueEntry[] };

// Queues are stations where a kind of work happens (04 §3). They are defined here, never by a
// hospital; hospitals may only rename or deactivate them. More doctors or rooms in a clinic does
// not mean more queues: that's Rooms (07) and per-doctor assignment (11).

function defaultQueue(deptKey: string, deptName: string): QueueEntry[] {
  return [{ systemKey: `${deptKey}_QUEUE`, name: `${deptName} Queue` }];
}

type ClinicNames = { triage?: string; consultation?: string; procedure?: string };

/**
 * The standard three stations of an outpatient clinic (11 §7: triage → doctor → procedure),
 * followed by the department's own specialty stations.
 */
function clinic(deptKey: string, deptName: string, extra: QueueEntry[] = [], names: ClinicNames = {}): QueueEntry[] {
  return [
    { systemKey: `${deptKey}_TRIAGE`,       name: names.triage       ?? `${deptName} Nursing Station` },
    { systemKey: `${deptKey}_CONSULTATION`, name: names.consultation ?? `${deptName} Clinic` },
    { systemKey: `${deptKey}_PROCEDURE`,    name: names.procedure    ?? `${deptName} Procedure Room` },
    ...extra,
  ];
}

export const DEPARTMENT_CATALOG: DeptEntry[] = [
  // ── Front of house & emergency ──────────────────────────────────────────────
  {
    systemKey: 'RECEPTION',
    name: 'Reception',
    queues: defaultQueue('RECEPTION', 'Reception'),
  },
  {
    systemKey: 'EMERGENCY',
    name: 'Emergency',
    queues: [
      { systemKey: 'EMERGENCY_QUEUE',       name: 'Emergency Queue' },
      { systemKey: 'RESUSCITATION_QUEUE',   name: 'Resuscitation Queue' },
      { systemKey: 'TRIAGE_QUEUE',          name: 'Triage Queue' },
      { systemKey: 'OBSERVATION_QUEUE',     name: 'Observation Queue' },
    ],
  },

  // ── Outpatient clinics (standard three + specialty stations) ────────────────
  {
    systemKey: 'OUTPATIENT',
    name: 'General Outpatient (GOPD)',
    queues: [
      { systemKey: 'OUTPATIENT_TRIAGE',     name: 'GOPD Nursing Station' },
      { systemKey: 'GENERAL_CONSULTATION',  name: 'General Consultation' },
      { systemKey: 'OUTPATIENT_PROCEDURE',  name: 'GOPD Procedure Room' },
    ],
  },
  {
    systemKey: 'INTERNAL_MEDICINE',
    name: 'Internal Medicine',
    queues: clinic('INTERNAL_MEDICINE', 'Medical', [
      { systemKey: 'DIABETES_CLINIC',     name: 'Diabetes Clinic' },
      { systemKey: 'HYPERTENSION_CLINIC', name: 'Hypertension Clinic' },
    ]),
  },
  {
    systemKey: 'GENERAL_SURGERY',
    name: 'General Surgery',
    queues: clinic('GENERAL_SURGERY', 'Surgical', [
      { systemKey: 'SURGERY_DRESSING_ROOM', name: 'Surgical Dressing Room' },
    ]),
  },
  {
    systemKey: 'OBSTETRICS_GYNAECOLOGY',
    name: 'Obstetrics & Gynaecology',
    queues: clinic('OBSTETRICS_GYNAECOLOGY', 'O&G', [
      { systemKey: 'ANTENATAL_CLINIC',     name: 'Antenatal Clinic' },
      { systemKey: 'POSTNATAL_CLINIC',     name: 'Postnatal Clinic' },
      { systemKey: 'FAMILY_PLANNING',      name: 'Family Planning' },
      { systemKey: 'OBSTETRIC_ULTRASOUND', name: 'Obstetric Ultrasound' },
      { systemKey: 'LABOUR_WARD_TRIAGE',   name: 'Labour Ward Triage' },
    ], { consultation: 'Gynaecology Clinic' }),
  },
  {
    systemKey: 'PEDIATRICS',
    name: 'Paediatrics',
    queues: clinic('PEDIATRICS', 'Paediatric', [
      { systemKey: 'IMMUNISATION',        name: 'Immunisation' },
      { systemKey: 'CHILD_WELFARE_CLINIC', name: 'Child Welfare Clinic' },
    ]),
  },
  {
    systemKey: 'CARDIOLOGY',
    name: 'Cardiology',
    queues: clinic('CARDIOLOGY', 'Cardiology', [
      { systemKey: 'ECG',                name: 'ECG' },
      { systemKey: 'ECHOCARDIOGRAPHY',   name: 'Echocardiography' },
    ]),
  },
  {
    systemKey: 'NEUROLOGY',
    name: 'Neurology',
    queues: clinic('NEUROLOGY', 'Neurology', [
      { systemKey: 'EEG', name: 'EEG' },
    ]),
  },
  {
    systemKey: 'ORTHOPEDICS',
    name: 'Orthopaedics',
    queues: clinic('ORTHOPEDICS', 'Orthopaedic', [
      { systemKey: 'PLASTER_ROOM', name: 'Plaster Room' },
    ]),
  },
  {
    systemKey: 'OPHTHALMOLOGY',
    name: 'Ophthalmology',
    queues: clinic('OPHTHALMOLOGY', 'Eye', [
      { systemKey: 'VISUAL_ACUITY', name: 'Visual Acuity' },
      { systemKey: 'REFRACTION',    name: 'Refraction' },
    ]),
  },
  {
    systemKey: 'ENT',
    name: 'Ear, Nose & Throat',
    queues: clinic('ENT', 'ENT', [
      { systemKey: 'AUDIOMETRY', name: 'Audiometry' },
    ]),
  },
  {
    systemKey: 'DENTAL',
    name: 'Dental',
    queues: clinic('DENTAL', 'Dental', [
      { systemKey: 'DENTAL_XRAY', name: 'Dental X-Ray' },
    ], { procedure: 'Dental Chair' }),
  },
  {
    systemKey: 'PHYSIOTHERAPY',
    name: 'Physiotherapy',
    queues: clinic('PHYSIOTHERAPY', 'Physiotherapy', [], {
      consultation: 'Physiotherapy Assessment',
      procedure:    'Physiotherapy Treatment',
    }),
  },
  {
    systemKey: 'PSYCHIATRY',
    name: 'Psychiatry',
    queues: clinic('PSYCHIATRY', 'Psychiatry'),
  },
  {
    systemKey: 'DERMATOLOGY',
    name: 'Dermatology',
    queues: clinic('DERMATOLOGY', 'Dermatology'),
  },
  {
    systemKey: 'UROLOGY',
    name: 'Urology',
    queues: clinic('UROLOGY', 'Urology'),
  },
  {
    systemKey: 'HIV_ART',
    name: 'HIV / ART Clinic',
    queues: clinic('HIV_ART', 'ART', [
      { systemKey: 'ADHERENCE_COUNSELLING', name: 'Adherence Counselling' },
      { systemKey: 'ART_REFILL',            name: 'ART Refill' },
    ]),
  },
  {
    systemKey: 'TB_DOTS',
    name: 'TB / DOTS',
    queues: clinic('TB_DOTS', 'TB', [
      { systemKey: 'DOTS_DISPENSING', name: 'DOTS Dispensing' },
    ]),
  },
  {
    systemKey: 'DIALYSIS',
    name: 'Renal / Dialysis',
    queues: clinic('DIALYSIS', 'Renal', [
      { systemKey: 'DIALYSIS_UNIT', name: 'Dialysis Unit' },
    ]),
  },
  {
    systemKey: 'ONCOLOGY',
    name: 'Oncology',
    queues: clinic('ONCOLOGY', 'Oncology', [
      { systemKey: 'CHEMOTHERAPY_SUITE', name: 'Chemotherapy Suite' },
    ]),
  },

  // ── Hospital-wide clinical services ─────────────────────────────────────────
  {
    systemKey: 'NURSING',
    name: 'Nursing',
    queues: [
      { systemKey: 'INJECTION_ROOM', name: 'Injection Room' },
      { systemKey: 'DRESSING_ROOM',  name: 'Dressing Room' },
    ],
  },
  {
    systemKey: 'ICU',
    name: 'ICU',
    queues: defaultQueue('ICU', 'ICU'),            // ICU work is ward-based (11 §13.1)
  },
  {
    systemKey: 'THEATRE',
    name: 'Theatre',
    queues: [
      { systemKey: 'PRE_OP',       name: 'Pre-op' },
      { systemKey: 'THEATRE_LIST', name: 'Theatre List' },
      { systemKey: 'RECOVERY',     name: 'Recovery (PACU)' },
    ],
  },

  // ── Diagnostics & pharmacy ──────────────────────────────────────────────────
  {
    systemKey: 'PHARMACY',
    name: 'Pharmacy',
    queues: [
      { systemKey: 'DISPENSING_QUEUE',   name: 'Outpatient Dispensing' },
      { systemKey: 'INPATIENT_PHARMACY', name: 'Inpatient / Ward Pharmacy' },
      { systemKey: 'RETAIL_COUNTER',     name: 'Retail Counter' },
    ],
  },
  {
    systemKey: 'LABORATORY',
    name: 'Laboratory',
    queues: [
      { systemKey: 'SAMPLE_COLLECTION',     name: 'Sample Collection' },
      { systemKey: 'HEMATOLOGY_QUEUE',      name: 'Hematology' },
      { systemKey: 'CHEMISTRY_QUEUE',       name: 'Chemistry' },
      { systemKey: 'MICROBIOLOGY',          name: 'Microbiology' },
      { systemKey: 'SEROLOGY',              name: 'Serology' },
      { systemKey: 'HISTOPATHOLOGY',        name: 'Histopathology' },
      { systemKey: 'RESULT_VERIFICATION',   name: 'Result Verification' },
      { systemKey: 'BLOOD_BANK_CROSSMATCH', name: 'Blood Bank – Cross-match' },
      { systemKey: 'BLOOD_BANK_ISSUE',      name: 'Blood Bank – Issue' },
    ],
  },
  {
    systemKey: 'RADIOLOGY',
    name: 'Radiology',
    queues: [
      { systemKey: 'XRAY_QUEUE',          name: 'X-Ray' },
      { systemKey: 'ULTRASOUND_QUEUE',    name: 'Ultrasound' },
      { systemKey: 'CT_SCAN_QUEUE',       name: 'CT Scan' },
      { systemKey: 'MRI',                 name: 'MRI' },
      { systemKey: 'MAMMOGRAPHY',         name: 'Mammography' },
      { systemKey: 'FLUOROSCOPY',         name: 'Fluoroscopy' },
      { systemKey: 'RADIOLOGY_REPORTING', name: 'Reporting' },      // object worklist: no patient waits here
    ],
  },

  // ── Administration ──────────────────────────────────────────────────────────
  {
    systemKey: 'MEDICAL_RECORDS',
    name: 'Medical Records',
    queues: [{ systemKey: 'FOLDER_RETRIEVAL', name: 'Folder Retrieval' }],
  },
  {
    systemKey: 'ACCOUNTS',
    name: 'Accounts',
    // PRD 10 §9
    queues: [
      { systemKey: 'CASHIER_QUEUE',   name: 'Cashier' },
      { systemKey: 'INSURANCE_QUEUE', name: 'Insurance / HMO Desk' },
      { systemKey: 'WRITE_OFF_QUEUE', name: 'Write-offs & Approvals' },
    ],
  },
  {
    systemKey: 'HR',
    name: 'HR',
    queues: defaultQueue('HR', 'HR'),
  },
  {
    systemKey: 'ADMINISTRATION',
    name: 'Administration',
    queues: defaultQueue('ADMINISTRATION', 'Administration'),
  },
];

const ACTIVE_KEYS: Record<string, string[]> = {
  HOSPITAL:   DEPARTMENT_CATALOG.map(d => d.systemKey), // all active
  LABORATORY: ['RECEPTION', 'LABORATORY', 'ACCOUNTS', 'ADMINISTRATION'],
  PHARMACY:   ['RECEPTION', 'PHARMACY', 'ACCOUNTS', 'ADMINISTRATION'],
};

// Queues replaced by a department's own stations. Seeding soft-deletes them where they still exist.
export const RETIRED_QUEUE_KEYS = [
  'ACCOUNTS_QUEUE',
  'NURSING_QUEUE', 'THEATRE_QUEUE', 'MEDICAL_RECORDS_QUEUE',
  'PEDIATRICS_QUEUE', 'CARDIOLOGY_QUEUE', 'NEUROLOGY_QUEUE', 'ORTHOPEDICS_QUEUE',
  'DENTAL_QUEUE', 'PHYSIOTHERAPY_QUEUE',
];

export function getActiveKeys(businessType: string): Set<string> {
  return new Set(ACTIVE_KEYS[businessType] ?? ACTIVE_KEYS['HOSPITAL']);
}
