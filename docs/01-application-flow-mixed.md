# CareFusion — Application Flow & Domain Map

Status: Draft v1 · Author: (you) · Last updated: 2026-07-05

This document exists to answer one question before any architecture or feature spec is written:
**what actually happens, to which entities, owned by which module, in what order** — across a
single hospital organization (which may have one or many branches).

It is intentionally implementation-light. Decisions made here (module ownership, entity
boundaries, flow sequencing) are inputs to `02-technical-prd.md`; open questions found while
writing it are pushed there rather than guessed at here.

---

## 1. Deployment & Tenancy Recap

(Decided — see conversation; restated here so this doc is self-contained.)

- **Single-tenant per install.** One hospital *organization* — whether a solo clinic or a chain
  with many branches — runs one dedicated instance with one database. There is no cross-org
  multi-tenancy inside the app; a chain's branches are sub-records (`Hospital`/`Branch`) under
  that one org, not separate tenants.
- **On-prem/LAN or single rented server.** The always-on target is a local box on the hospital's
  network or a normal cloud VM — not an offline-capable client that syncs later. No conflict
  resolution / offline queue engineering is in scope.
- **Runtime target: modular monolith.** One deployable Nest process, one database, modules talk
  in-process. The current RabbitMQ-per-app / separate-Prisma-per-app setup (`users`,
  `appointments`, `notifications` each have their own `schema.prisma` and DB) is the *old*
  microservices shape and needs to be consolidated — tracked as a migration item in the
  Technical PRD, not re-litigated here.

## 2. Actors / Roles

Pulled from what's already modeled in `apps/users/prisma/schema.prisma` (`UserType`,
`HospitalStaffRole`) — this is the real source of truth, not invented:

| UserType | Notes |
|---|---|
| `SUPERADMIN` | Platform/owner-level. Manages hospital org setup, licensing, global config. |
| `ADMIN` | Hospital-org-level admin. Manages branches, staff, roles/permissions. |
| `HOSPITAL_STAFF` | Umbrella type; actual function comes from `HospitalStaffRole`. |
| `PATIENT` | Has an NFC card (`Patient.nfcId`), balance, insurance scheme link. |
| `NHIS_WORKER` | Insurance scheme staff — claims processing, verification. |
| `PUBLIC_HEALTH_WORKER` | Read-only analytics/reporting role. |

`HospitalStaffRole` (staff sub-roles): `ADMIN, SUPERADMIN, MANAGER, DOCTOR, NURSE, LAB_ADMIN,
PHARMACIST, RECEPTIONIST, ACCOUNTANT, LAB_TECHNICIAN, PHARMACY_TECHNICIAN, RADIOLOGIST,
PHLEBOTOMIST, OPTOMETRIST, DENTIST, OTHER`.

**Flag for Technical PRD:** `UserType.ADMIN` and `HospitalStaffRole.ADMIN`/`SUPERADMIN` overlap
confusingly (an admin *is* hospital staff). RBAC design needs to resolve whether role
authorization is driven purely by `Role`/`RolePermission`/`Resource` (already modeled) and these
enums become legacy/display-only, or vice versa. Don't design two competing permission systems.

## 3. Module Ownership Map

One database, but each module should still *own* its tables (a modular monolith's modules are
enforced by code/schema convention, not by network boundary). Based on what's scaffolded today:

| Module | Owns | Current state |
|---|---|---|
| **Users & Identity** | `User`, `Role`, `Resource`, `RolePermission`, `PersonalAccessToken`, `PasswordHistory`, `Address` | Most built-out. CRUD for all user types done; login pending. |
| **Hospital/Org Admin** | `Hospital` (needs `Branch` — see §6), staff assignment | CRUD done, gateway wiring pending. |
| **Patients** | `Patient`, `NextOfKin`, NFC linkage | Modeled, not yet service-complete. |
| **Appointments/Consultations** | `Clinic`, `ConsultationType`, `Appointment`, consultation notes/vitals (not yet modeled) | Schema exists for scheduling; `consultations` app is still scaffold ("Hello World") — clinical note-taking data model doesn't exist yet. |
| **Laboratory** | test catalog, orders, samples, results | Not started — scaffold only. |
| **Pharmacy + POS** | drug catalog, stock/inventory, prescriptions, POS sale/checkout | Not started — scaffold only. |
| **Billing & Insurance** | `Transaction`, invoices/line-items (not yet modeled), `InsuranceScheme`, claims | `Transaction` model exists but is generic/unstructured; no invoice or claims model yet; `billing` app is scaffold only. |
| **Notifications** | `Notification` | Modeled but schema file also contains an unrelated `Review`/`ServiceType` (CATERING/EVENTCENTER) model — **leftover boilerplate from a different project, not CareFusion domain**. Flag to delete in Technical PRD data-model cleanup. |
| **Public Health Reporting** | read-only aggregation views | Story only, nothing built. |

## 4. Core End-to-End Flows

These are the flows the Technical PRD's architecture must support cleanly (module boundaries,
transactions, events). Each is written as the real-world sequence, with the owning module per
step in brackets.

### 4.1 Patient Registration & Intake
1. Receptionist/Admin creates `Patient` record (demographics, NHIS/insurance scheme link if any)
   `[Patients]`.
2. NFC card issued and linked (`nfcId`, `nfcLinkedAt`, `nfcLinkedBy`) `[Patients]`.
3. `registrationFee`/`nfcCardFee` charged per `Hospital` config `[Billing]`.
4. Welcome/registration notification sent `[Notifications]`.

### 4.2 Outpatient Visit (the core loop — everything else hangs off this)
1. Appointment booked — by patient-facing staff or receptionist — against a `doctorId`,
   `consultationTypeId`, `reason` `[Appointments]`.
2. Patient checks in (`checkin`, `checkinAt`) — potentially via NFC tap `[Appointments]`.
3. Doctor starts consultation (`appointmentStartedAt`, status → `IN_PROGRESS`); records
   clinical notes/vitals/diagnosis — **data model doesn't exist yet** `[Consultations]`.
4. Doctor places zero or more orders out of the consultation:
   - Lab test order(s) `[Laboratory]`
   - Prescription(s) `[Pharmacy]`
   - Referral to another doctor/branch (`referralNote`, `referredById` already modeled)
     `[Appointments]`
5. Each order module fulfills independently and reports back (result/dispensed status) — this is
   the main place the Technical PRD needs a clean **cross-module event or callback contract**
   (e.g. "lab result ready" should notify the consultation and trigger a notification, without
   Consultations reaching directly into Laboratory's tables).
6. Consultation ends (`appointmentEndedAt`, status → `COMPLETED`); every billable line item
   generated along the way (consultation fee, per-test fee, per-drug fee) rolls up into one
   **invoice** `[Billing]` — invoice model doesn't exist yet, only a flat `Transaction`.
7. Patient pays — cash/card/transfer at the front desk, or the balance is billed to
   `InsuranceScheme` per `Patient.billingtype` `[Billing]`.
8. Notification(s) fired at key transitions (appointment reminder, result ready, invoice due)
   `[Notifications]`.

### 4.3 Pharmacy POS Walk-in Sale (no appointment)
1. Walk-in customer (may or may not be a registered `Patient`) buys OTC drugs at the counter.
2. Pharmacist/technician rings up items against drug catalog + stock `[Pharmacy]`.
3. Stock decremented; low-stock threshold check for reorder `[Pharmacy]`.
4. Payment taken directly at POS — **this is a `Billing`-owned payment, not routed through a
   consultation invoice** — Technical PRD needs to decide the shared "payment/transaction"
   primitive both flows use.

### 4.4 Laboratory Order → Result
1. Order received from a consultation (4.2) or as a walk-in lab request `[Laboratory]`.
2. Sample collected (phlebotomist), tracked through processing states.
3. Result entered/verified by lab tech/radiologist.
4. Result availability triggers a notification and becomes visible to the ordering doctor and
   the patient `[Notifications]` `[Consultations]`.
5. Billed per test, same billing primitive as 4.2/4.3.

### 4.5 Insurance Claim
1. Patient's `billingtype = INSURANCE` — invoice for a visit (4.2) is routed to
   `InsuranceScheme` instead of (or split with) direct patient payment.
2. `NHISWorker` reviews claim, approves/rejects, with audit log.
3. Approved amount settles against the hospital's receivable; rejected amount reverts to patient
   balance or is written off.
4. **Not yet modeled**: `Claim` entity, claim status enum, audit trail. `InsuranceScheme` and
   `NHISWorker` exist; the claim object itself doesn't.

### 4.6 Inventory Replenishment (Pharmacy, and Lab consumables)
1. Stock falls below threshold (from 4.3 or 4.4 consumption) `[Pharmacy]`/`[Laboratory]`.
2. Manager/pharmacist raises a purchase order to a supplier — **not modeled at all yet**.
3. Stock received, quantities updated, cost basis recorded for margin reporting.

### 4.7 Admin / RBAC Provisioning
1. `SUPERADMIN` sets up the hospital org (`Hospital` record, `PaymentPlan`).
2. `ADMIN` creates branches (see §6 gap), invites staff, assigns `Role` + `RolePermission`.
3. Staff `User` created with `type = HOSPITAL_STAFF` and a `HospitalStaffRole`.
4. Ongoing: admin monitors staff activity, adjusts permissions, deactivates accounts
   (`UserStatus`).

## 5. Cross-Cutting Concerns (push to Technical PRD)

- **RBAC design collision** — see §2 flag (two overlapping role systems).
- **Shared payment primitive** — consultations, POS, and lab all need to produce billable lines
  into one coherent invoicing/payment model; today there's only a flat `Transaction`.
- **Cross-module contracts** — how does Consultations "see" a lab result or dispense event
  without importing Laboratory's/Pharmacy's Prisma models directly? (In-process event bus vs.
  direct service injection vs. read-only projection — decide in Technical PRD.)
- **Audit/soft-delete convention** — already consistently used (`deletedAt`/`deletedBy`,
  `updatedBy`) across the `users` schema; this convention should be codified as a house rule, not
  re-decided per module.
- **Multi-branch** — `Hospital` today has no `Branch` concept; a "chain of hospitals" needs
  branch-level scoping (which staff/patients/inventory belong to which branch) or everything
  (patients, staff, stock) is implicitly org-wide. Needs an explicit decision.
- **Data model cleanup** — delete the stray `Review`/`ServiceType` catering models from
  `notifications/prisma/schema.prisma`; they're leftover from an unrelated template.
- **DB/transport consolidation** — merging `users`, `appointments`, `notifications` (currently
  separate DBs + RMQ) into one shared database and one process is a migration with real data risk
  if any of these have live data; confirm none do before treating it as a pure schema exercise.

## 6. Open Questions for Technical PRD

1. Do we model `Branch` explicitly under `Hospital` now, or defer multi-branch to phase 2 and
   design the schema so it's additive later (e.g. every clinical/inventory table gets a nullable
   `branchId` from day one even if UI doesn't expose branch switching yet)?
2. What's the canonical billing primitive — a proper `Invoice` + `InvoiceLine` + `Payment` model
   replacing/wrapping the current flat `Transaction`?
3. In-process module communication mechanism: direct NestJS provider injection across module
   boundaries, or an internal domain-event bus (e.g. `@nestjs/event-emitter` or CQRS module) to
   keep modules decoupled?
4. Single shared Prisma schema (one `schema.prisma`, all models, still logically grouped by
   module via naming/comments) vs. multiple schema files composed at build time? (Prisma doesn't
   natively support multi-file schemas well pre-6.7 — worth confirming version support.)

---

**Next:** once you confirm/adjust §6 and the ownership map in §3, this feeds directly into
`02-technical-prd.md` (architecture, module structure, data model, auth, deployment, NFRs).
