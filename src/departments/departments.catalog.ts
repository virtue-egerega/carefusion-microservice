export type QueueEntry = { systemKey: string; name: string };
export type DeptEntry  = { systemKey: string; name: string; queues: QueueEntry[] };

function defaultQueue(deptKey: string, deptName: string): QueueEntry[] {
  return [{ systemKey: `${deptKey}_QUEUE`, name: `${deptName} Queue` }];
}

export const DEPARTMENT_CATALOG: DeptEntry[] = [
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
  {
    systemKey: 'OUTPATIENT',
    name: 'Outpatient',
    queues: [{ systemKey: 'GENERAL_CONSULTATION', name: 'General Consultation' }],
  },
  {
    systemKey: 'NURSING',
    name: 'Nursing',
    queues: defaultQueue('NURSING', 'Nursing'),
  },
  {
    systemKey: 'PHARMACY',
    name: 'Pharmacy',
    queues: [{ systemKey: 'DISPENSING_QUEUE', name: 'Dispensing' }],
  },
  {
    systemKey: 'LABORATORY',
    name: 'Laboratory',
    queues: [
      { systemKey: 'SAMPLE_COLLECTION',    name: 'Sample Collection' },
      { systemKey: 'HEMATOLOGY_QUEUE',     name: 'Hematology' },
      { systemKey: 'CHEMISTRY_QUEUE',      name: 'Chemistry' },
      { systemKey: 'RESULT_VERIFICATION',  name: 'Result Verification' },
    ],
  },
  {
    systemKey: 'RADIOLOGY',
    name: 'Radiology',
    queues: [
      { systemKey: 'XRAY_QUEUE',       name: 'X-Ray' },
      { systemKey: 'ULTRASOUND_QUEUE', name: 'Ultrasound' },
      { systemKey: 'CT_SCAN_QUEUE',    name: 'CT Scan' },
    ],
  },
  {
    systemKey: 'THEATRE',
    name: 'Theatre',
    queues: defaultQueue('THEATRE', 'Theatre'),
  },
  {
    systemKey: 'ICU',
    name: 'ICU',
    queues: defaultQueue('ICU', 'ICU'),
  },
  {
    systemKey: 'PEDIATRICS',
    name: 'Pediatrics',
    queues: defaultQueue('PEDIATRICS', 'Pediatrics'),
  },
  {
    systemKey: 'CARDIOLOGY',
    name: 'Cardiology',
    queues: defaultQueue('CARDIOLOGY', 'Cardiology'),
  },
  {
    systemKey: 'NEUROLOGY',
    name: 'Neurology',
    queues: defaultQueue('NEUROLOGY', 'Neurology'),
  },
  {
    systemKey: 'ORTHOPEDICS',
    name: 'Orthopedics',
    queues: defaultQueue('ORTHOPEDICS', 'Orthopedics'),
  },
  {
    systemKey: 'DENTAL',
    name: 'Dental',
    queues: defaultQueue('DENTAL', 'Dental'),
  },
  {
    systemKey: 'PHYSIOTHERAPY',
    name: 'Physiotherapy',
    queues: defaultQueue('PHYSIOTHERAPY', 'Physiotherapy'),
  },
  {
    systemKey: 'MEDICAL_RECORDS',
    name: 'Medical Records',
    queues: defaultQueue('MEDICAL_RECORDS', 'Medical Records'),
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

// Queues replaced by a department's own PRD. Seeding soft-deletes them where they still exist.
export const RETIRED_QUEUE_KEYS = ['ACCOUNTS_QUEUE'];

export function getActiveKeys(businessType: string): Set<string> {
  return new Set(ACTIVE_KEYS[businessType] ?? ACTIVE_KEYS['HOSPITAL']);
}
