import { CLINIC_CATALOG } from '../departments/departments.catalog';

export type PermissionEntry = { key: string; name: string; description: string };

export const PERMISSION_CATALOG: PermissionEntry[] = [
    // Administration
    { key: 'org.manage',          name: 'Manage Organisation',       description: 'Manage organisation settings' },
    { key: 'branch.manage',       name: 'Manage Branches',           description: 'Create and manage branches' },
    { key: 'staff.manage',        name: 'Manage Staff',              description: 'Create, edit and deactivate staff accounts' },
    { key: 'staff.password.reset', name: 'Reset Staff Password',     description: 'Issue a temporary password the staff member must change at next login' },
    { key: 'department.manage',   name: 'Manage Departments',        description: 'Enable, disable and rename departments and queues' },
    { key: 'duty_profile.manage', name: 'Manage Duty Profiles',      description: 'Create and assign duty profiles' },
    { key: 'report.view',         name: 'View Reports',              description: 'View operational reports' },
    { key: 'metrics.view',        name: 'View Metrics',              description: 'View dashboards and operational metrics' },

    // Patient
    { key: 'patient.register', name: 'Register Patient',    description: 'Register a new patient' },
    { key: 'patient.list',     name: 'List Patients',       description: 'See and search the patient list and its statistics' },
    { key: 'patient.view',     name: 'View Patient',        description: "Open a single patient's full record" },
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
    { key: 'queue.call',         name: 'Work Queue Tasks',     description: 'Call, start and complete tasks on your queues, and send the patient on' },
    { key: 'queue.send',         name: 'Send Patients',        description: "Put patients on other stations' lists (billing, nursing stations) from your duty profiles' send lists" },
    { key: 'appointment.create', name: 'Book Appointment',     description: 'Book appointments' },
    { key: 'appointment.manage', name: 'Manage Appointments',  description: 'Reschedule or cancel appointments' },
    { key: 'encounter.create',   name: 'Create Encounter',     description: 'Open a patient visit or walk-in encounter' },
    { key: 'encounter.follow_up', name: 'Follow Up Encounters', description: 'See unfinished visits and record what happened when the patient left' },

    // Billing (PRD 10 §10)
    { key: 'billing.view',                 name: 'View Billing',                 description: 'View charges, allocations and account statements' },
    { key: 'billing.charge.create',        name: 'Post Manual Charge',           description: 'Post a charge not raised by another module' },
    { key: 'billing.payment.receive',      name: 'Receive Payment',              description: 'Record deposits, apply payments and issue receipts' },
    { key: 'billing.account.create',        name: 'Create Billing Account',       description: 'Open a family billing account' },
    { key: 'billing.account.member.add',    name: 'Add Account Member',           description: 'Put a patient on a family billing account' },
    { key: 'billing.account.member.remove', name: 'Remove Account Member',        description: 'Take a patient off a family billing account' },
    { key: 'billing.account.update',        name: 'Update Billing Account',       description: 'Edit the name and holder details of a billing account' },
    { key: 'billing.refund.request',       name: 'Request Refund',               description: 'Raise refund requests' },
    { key: 'billing.void.request',         name: 'Request Charge Void',          description: 'Raise charge void requests' },
    { key: 'billing.transfer.request',     name: 'Request Transfer',             description: 'Raise balance transfer requests' },
    { key: 'billing.adjustment.request',   name: 'Request Adjustment',           description: 'Raise ledger adjustment requests' },
    { key: 'billing.credit_limit.request', name: 'Request Credit Limit Change',  description: 'Raise credit limit change requests' },
    { key: 'billing.writeoff.request',     name: 'Request Write-off',            description: 'Raise write-off and recovery requests' },

    // Coverage & payers
    { key: 'coverage.view',   name: 'View Coverage',          description: 'See a patient\'s coverages and remaining benefit' },
    { key: 'coverage.select', name: 'Select Coverage',        description: 'Choose which coverage applies to a visit and set coverage priority' },
    { key: 'coverage.enrol',  name: 'Enrol Coverage',         description: 'Enrol principals and add dependants to policies' },
    { key: 'coverage.end',    name: 'End Coverage',           description: 'End a coverage (ending a principal ends the whole policy)' },
    { key: 'payer.manage',    name: 'Manage Payers & Plans',  description: 'Manage payers, plans, benefits, copay and caps' },

    // Insurance desk
    { key: 'insurance.preauth.record',    name: 'Record Pre-authorisation', description: 'Capture authorisation codes or record refusal' },
    { key: 'insurance.claim.review',      name: 'Record Payer Decisions',   description: 'Record payer approval or rejection per line' },
    { key: 'insurance.remittance.record', name: 'Record Remittance',        description: 'Post payer remittances and match them to lines' },
    { key: 'insurance.rejection.resolve', name: 'Resolve Rejections',       description: 'Rebill a rejected line to the patient' },

    // Finance control
    { key: 'finance.request.approve', name: 'Approve Financial Requests', description: 'Approve or reject financial requests within approval limits' },
    { key: 'finance.policy.manage',   name: 'Manage Approval Policy',     description: 'Edit approval limits and dual-approval thresholds' },
    { key: 'finance.report.view',     name: 'View Finance Reports',       description: 'Write-off register, refund/adjustment/void reports, payer ageing' },
];

// Permissions retired from the catalog. On seeding, holders of an old key are granted its
// replacements (system-seeded profiles excluded — their sets come from SYSTEM_DUTY_PROFILES),
// then the old Permission row is deleted.
export const RETIRED_PERMISSIONS: Record<string, string[]> = {
    'billing.create':  ['billing.charge.create'],
    // "receive payments" and "approve" must not share a key (PRD 10 §8); approval is granted separately
    'billing.approve': ['billing.payment.receive'],
    // Split so reception can open/join accounts while removals stay with Accounts
    // Split so reception can pick a visit's coverage while enrolment and ending stay with the insurance desk
    'coverage.manage': ['coverage.select', 'coverage.enrol', 'coverage.end'],
    'billing.account.manage': [
        'billing.account.create', 'billing.account.member.add', 'billing.account.member.remove', 'billing.account.update',
    ],
};

export type SystemDutyProfile = {
    name: string;
    role: 'SUPERADMIN' | 'RECEPTIONIST' | 'ACCOUNTANT' | 'MANAGER';
    departmentKey: string;
    queueKeys: string[];
    sendQueueKeys?: string[];   // queues the profile may put patients on (11 §5.7)
    permissions: string[];
};

const INSURANCE_PERMISSIONS = [
    'insurance.preauth.record', 'insurance.claim.review', 'insurance.remittance.record', 'insurance.rejection.resolve',
];

const CASHIER_PERMISSIONS = [
    'billing.view', 'billing.payment.receive',
    'billing.account.create', 'billing.account.member.add', 'billing.account.member.remove', 'billing.account.update',
    'billing.refund.request', 'billing.void.request', 'billing.transfer.request',
    'coverage.view',
];

// Duty profiles seeded for every organisation. Only Hospital Administrator is assigned
// automatically (to the onboarding admin). Tenants may edit them afterwards; approval
// limits are deliberately not seeded — the tenant sets them (PRD 10 §10).
export const SYSTEM_DUTY_PROFILES: SystemDutyProfile[] = [
    {
        name: 'Hospital Administrator',
        role: 'SUPERADMIN',
        departmentKey: 'ADMINISTRATION',
        queueKeys: [],
        permissions: [
            'org.manage', 'branch.manage', 'staff.manage', 'staff.password.reset', 'department.manage', 'duty_profile.manage',
            'report.view', 'metrics.view',
            'patient.list', 'patient.view', 'patient.assign',
            'appointment.create', 'appointment.manage',
            'billing.view', 'finance.report.view',
        ],
    },
    {
        name: 'Receptionist',
        role: 'RECEPTIONIST',
        departmentKey: 'RECEPTION',
        queueKeys: ['RECEPTION_QUEUE'],
        // Reception sends checked-in patients to billing, a clinic's nursing station, or both
        sendQueueKeys: ['CASHIER_QUEUE', ...new Set(CLINIC_CATALOG.map(c => c.triageQueue))],
        permissions: [
            'patient.register', 'patient.list', 'patient.view', 'patient.edit', 'patient.assign',
            'queue.view', 'queue.manage', 'queue.send',
            'appointment.create', 'appointment.manage',
            'encounter.create', 'encounter.follow_up',
            'billing.view', 'billing.account.create', 'billing.account.member.add', 'coverage.view', 'coverage.select',
        ],
    },
    {
        name: 'Cashier',
        role: 'ACCOUNTANT',
        departmentKey: 'ACCOUNTS',
        queueKeys: ['CASHIER_QUEUE'],
        permissions: CASHIER_PERMISSIONS,
    },
    {
        name: 'Insurance Officer',
        role: 'ACCOUNTANT',
        departmentKey: 'ACCOUNTS',
        queueKeys: ['INSURANCE_QUEUE'],
        permissions: ['billing.view', 'coverage.view', 'coverage.select', 'coverage.enrol', 'coverage.end', ...INSURANCE_PERMISSIONS, 'billing.writeoff.request'],
    },
    {
        name: 'Billing Supervisor',
        role: 'MANAGER',
        departmentKey: 'ACCOUNTS',
        queueKeys: ['CASHIER_QUEUE', 'INSURANCE_QUEUE', 'WRITE_OFF_QUEUE'],
        permissions: [...new Set([
            ...CASHIER_PERMISSIONS,
            'coverage.select', 'coverage.enrol', 'coverage.end', ...INSURANCE_PERMISSIONS, 'billing.writeoff.request',
            'billing.charge.create', 'billing.adjustment.request', 'billing.credit_limit.request',
            'finance.request.approve', 'finance.report.view',
        ])],
    },
    {
        name: 'Finance Manager',
        role: 'MANAGER',
        departmentKey: 'ACCOUNTS',
        queueKeys: ['WRITE_OFF_QUEUE'],
        permissions: ['billing.view', 'payer.manage', 'finance.request.approve', 'finance.policy.manage', 'finance.report.view'],
    },
];
