export type PermissionEntry = { key: string; description: string };

export const PERMISSION_CATALOG: PermissionEntry[] = [
    // Administration
    { key: 'org.manage',          description: 'Manage organisation settings' },
    { key: 'branch.manage',       description: 'Create and manage branches' },
    { key: 'staff.manage',        description: 'Create, edit and deactivate staff accounts' },
    { key: 'department.manage',   description: 'Enable, disable and rename departments and queues' },
    { key: 'duty_profile.manage', description: 'Create and assign duty profiles' },
    { key: 'report.view',         description: 'View operational reports' },
    { key: 'metrics.view',        description: 'View dashboards and operational metrics' },

    // Patient
    { key: 'patient.register', description: 'Register a new patient' },
    { key: 'patient.view',     description: 'View patient records' },
    { key: 'patient.edit',     description: 'Edit patient demographics' },
    { key: 'patient.assign',   description: 'Assign a patient to a staff member or department' },

    // Clinical
    { key: 'vitals.record',            description: 'Record patient vital signs' },
    { key: 'consultation.create',      description: 'Create consultation notes' },
    { key: 'diagnosis.create',         description: 'Record patient diagnoses' },
    { key: 'prescription.create',      description: 'Write prescriptions' },
    { key: 'prescription.dispense',    description: 'Dispense medication' },
    { key: 'lab.request',              description: 'Request laboratory tests' },
    { key: 'lab.result.enter',         description: 'Enter laboratory results' },
    { key: 'radiology.request',        description: 'Request radiology scans' },
    { key: 'radiology.result.enter',   description: 'Enter radiology results' },
    { key: 'nursing_note.create',      description: 'Write nursing notes' },
    { key: 'procedure.document',       description: 'Document clinical procedures' },
    { key: 'admission.create',         description: 'Admit a patient to a ward' },
    { key: 'discharge.approve',        description: 'Approve patient discharge' },

    // Queue & Appointments
    { key: 'queue.view',         description: 'View queue entries' },
    { key: 'queue.manage',       description: 'Add, remove or reorder queue entries' },
    { key: 'appointment.create', description: 'Book appointments' },
    { key: 'appointment.manage', description: 'Reschedule or cancel appointments' },

    // Billing
    { key: 'billing.view',    description: 'View bills and payment records' },
    { key: 'billing.create',  description: 'Create bills and invoices' },
    { key: 'billing.approve', description: 'Approve and process payments' },
];

// Permissions granted to the Hospital Administrator DutyProfile at onboarding
export const ADMIN_DUTY_PROFILE_PERMISSIONS = new Set([
    'org.manage', 'branch.manage', 'staff.manage', 'department.manage', 'duty_profile.manage',
    'report.view', 'metrics.view',
    'patient.view', 'patient.assign',
    'appointment.create', 'appointment.manage',
    'billing.view', 'billing.create', 'billing.approve',
]);
