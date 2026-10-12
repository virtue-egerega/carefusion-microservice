export type PermissionEntry = { key: string; name: string; description: string };

export const PERMISSION_CATALOG: PermissionEntry[] = [
    // Administration
    { key: 'org.manage',          name: 'Manage Organisation',       description: 'Manage organisation settings' },
    { key: 'branch.manage',       name: 'Manage Branches',           description: 'Create and manage branches' },
    { key: 'staff.manage',        name: 'Manage Staff',              description: 'Create, edit and deactivate staff accounts' },
    { key: 'department.manage',   name: 'Manage Departments',        description: 'Enable, disable and rename departments and queues' },
    { key: 'duty_profile.manage', name: 'Manage Duty Profiles',      description: 'Create and assign duty profiles' },
    { key: 'report.view',         name: 'View Reports',              description: 'View operational reports' },
    { key: 'metrics.view',        name: 'View Metrics',              description: 'View dashboards and operational metrics' },

    // Patient
    { key: 'patient.register', name: 'Register Patient',    description: 'Register a new patient' },
    { key: 'patient.view',     name: 'View Patients',       description: 'View patient records' },
    { key: 'patient.edit',     name: 'Edit Patient',        description: 'Edit patient demographics' },
    { key: 'patient.assign',   name: 'Assign Patient',      description: 'Assign a patient to a staff member or department' },

    // Clinical
    { key: 'vitals.record',          name: 'Record Vitals',           description: 'Record patient vital signs' },
    { key: 'consultation.create',    name: 'Create Consultation',     description: 'Create consultation notes' },
    { key: 'diagnosis.create',       name: 'Record Diagnosis',        description: 'Record patient diagnoses' },
    { key: 'prescription.create',    name: 'Write Prescription',      description: 'Write prescriptions' },
    { key: 'prescription.dispense',  name: 'Dispense Medication',     description: 'Dispense medication' },
    { key: 'lab.request',            name: 'Request Lab Test',        description: 'Request laboratory tests' },
    { key: 'lab.result.enter',       name: 'Enter Lab Results',       description: 'Enter laboratory results' },
    { key: 'radiology.request',      name: 'Request Radiology',       description: 'Request radiology scans' },
    { key: 'radiology.result.enter', name: 'Enter Radiology Results', description: 'Enter radiology results' },
    { key: 'nursing_note.create',    name: 'Write Nursing Note',      description: 'Write nursing notes' },
    { key: 'procedure.document',     name: 'Document Procedure',      description: 'Document clinical procedures' },
    { key: 'admission.create',       name: 'Admit Patient',           description: 'Admit a patient to a ward' },
    { key: 'discharge.approve',      name: 'Approve Discharge',       description: 'Approve patient discharge' },

    // Queue & Appointments
    { key: 'queue.view',         name: 'View Queue',           description: 'View queue entries' },
    { key: 'queue.manage',       name: 'Manage Queue',         description: 'Add, remove or reorder queue entries' },
    { key: 'appointment.create', name: 'Book Appointment',     description: 'Book appointments' },
    { key: 'appointment.manage', name: 'Manage Appointments',  description: 'Reschedule or cancel appointments' },
    { key: 'encounter.create',   name: 'Create Encounter',     description: 'Open a patient visit or walk-in encounter' },

    // Billing
    { key: 'billing.view',    name: 'View Billing',     description: 'View bills and payment records' },
    { key: 'billing.create',  name: 'Create Bill',      description: 'Create bills and invoices' },
    { key: 'billing.approve', name: 'Approve Payment',  description: 'Approve and process payments' },
];

// Permissions granted to the Hospital Administrator DutyProfile at onboarding
export const ADMIN_DUTY_PROFILE_PERMISSIONS = new Set([
    'org.manage', 'branch.manage', 'staff.manage', 'department.manage', 'duty_profile.manage',
    'report.view', 'metrics.view',
    'patient.view', 'patient.assign',
    'appointment.create', 'appointment.manage',
    'billing.view', 'billing.create', 'billing.approve',
]);

// Permissions granted to the Receptionist DutyProfile at onboarding
export const RECEPTIONIST_DUTY_PROFILE_PERMISSIONS = new Set([
    'patient.register', 'patient.view', 'patient.edit', 'patient.assign',
    'queue.view', 'queue.manage',
    'appointment.create', 'appointment.manage',
    'encounter.create',
    'billing.view',
]);
