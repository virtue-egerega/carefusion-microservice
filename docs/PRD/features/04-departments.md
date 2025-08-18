# Feature PRD — Departments & Queues

Status: Draft · Last updated: 2026-07-05
Depends on: `02-hospital-onboarding.md` (`Hospital`/`Branch`)
Referenced by: `docs/01-application-flow.md` §2 (queue-station mechanic); `05-access-control-
clinical-scoping.md` (queue visibility, permissions, `DutyProfile`); the User Management feature
(staff assignment, `Role`; not yet numbered).

Naming note: this PRD set calls the staff-profile table `Staff` (the codebase's current name for
it, `HospitalStaff`, migrates to match).

## 1. What Problem This Solves

`Staff.department` needs to be a real, queryable fact, not free text: it determines which
queue/worklist a staffer's dashboard opens to by default (the queue-station mechanic in
`01-application-flow.md` §2 — every department owns one or more queues), and which
department-tagged records surface for them first.

**Department (and Queue) are scoping concepts, not a permission engine.** They answer "where does
this person work / what do they see by default" — not "what are they allowed to do." That second
question is answered by `DutyProfile` (`05-access-control-clinical-scoping.md` §2–§3), keyed by
department + role + queue together — a Doctor assigned to Cardiology and a Doctor assigned to
Outpatient can have different permissions precisely *because* they're in different departments,
which is `05`'s job to express, not this document's.

## 2. Data Model

### 2.1 `Department`

```prisma
model Department {
  id        String    @id @default(uuid())
  systemKey String    @unique  // immutable, e.g. "LABORATORY"
  name      String            // tenant-editable display label, e.g. "Pathology Services"
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  updatedBy String?
  deletedAt DateTime?
  deletedBy String?

  staff     Staff[]
  queues    Queue[]
}
```

`systemKey` is immutable platform identity (never shown to a tenant, never editable) — `name` is
the tenant-facing, renamable label. A tenant can turn "Laboratory" into "Pathology Services" or
"Emergency" into "Accident & Emergency" by editing `name`; `systemKey` stays `"LABORATORY"` /
`"EMERGENCY"` underneath, which is what everything else (queues, `DutyProfile`, reports) actually
keys off. Departments are seeded from a fixed platform catalog (§3) — there is no
"create a department" API (§4).

No `hospitalId`: every install is a single, independent deployment with exactly one `Hospital` row
in its database (`02-hospital-onboarding.md` §1). A field meant to scope "which org does this
belong to" is inert when there's only ever one org to belong to. One department catalog per
database, shared across all of that org's branches in a chain — a branch doesn't get its own
independent department list (see §5 for why, §6 for the deferred alternative). The same reasoning
is why `Staff` (§2.3) and `Branch` (`02`) also carry no `hospitalId`.

### 2.2 `Queue`

```prisma
model Queue {
  id           String    @id @default(uuid())
  departmentId String
  systemKey    String    @unique                 // immutable, e.g. "GENERAL_CONSULTATION"
  name         String                            // tenant-editable display label
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  updatedBy    String?
  deletedAt    DateTime?
  deletedBy    String?

  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@index([departmentId])
}
```

Owned by exactly one `Department`; a department has one or more queues. Same system-seeded shape
as `Department` and for the same reason: queues are exactly as load-bearing as departments once
staff scoping, reports, and routing key off them (`05` §2–§3) — a tenant renames/disables, never
invents. See §3 for the seed list per department and §6 for what this document does *not* cover
(which queues a given staffer actually sees — that's `05`).

**A queue is a distinct physical or operational station, not every distinguishable visit type.**
Follow-up and Walk-in visits, for instance, aren't separate queues in most outpatient
clinics — they're the same doctor, same room, same worklist, just different *reasons* for the
visit, captured as an attribute of the appointment itself, not as a separate queue — §3's seed
list follows that convention.

### 2.3 `Staff`, and why it's separate from `User`

```prisma
model Staff {
  id           String      @id @default(uuid()) @map("user_id")
  user         User        @relation(fields: [id], references: [id], onDelete: Cascade)
  departmentId String?
  createdAt    DateTime    @default(now())

  department   Department? @relation(fields: [departmentId], references: [id])
}
```

No `department: String?` free text, no `hospitalId`, no `role` — see below for each.

**Why `Staff` is a table separate from `User`**: `User` carries everything universal to *any*
login-capable person — email, password, phone, status, and role. `Staff` holds only what's true
of an *employment* profile — today just `departmentId`; later (`06`) job title, employment status,
license number, etc. Keeping them separate matters for a concrete reason: a `User` can optionally
hold a `Staff` profile and a `Patient` profile at the same time — one physical person (most
commonly a nurse or doctor) can be both staff **and** a patient of their own hospital, under one
login. A merged `User`+`Staff` table couldn't express that without duplicate logins for the same
person.

**Why there's no `role` field on `Staff`**: role is a fact about the person, not the employment —
it lives on `User`, the universal answer to "what role does this person have" for every kind of
user (staff, patient, NHIS worker, admin alike), not duplicated here.

**Why there's no `hospitalId`**: every install has exactly one `Hospital` row (§2.1), so the field
never disambiguates anything. The same applies to `Patient`, `User`, and `Transaction`, and to
`Branch` in `02`.

`departmentId` is nullable: staff can exist before department rollout is finished for an org, or
before an admin gets around to assigning someone — matches the "build core first, roll out
progressively" delivery approach used elsewhere in this product.

## 3. Seeding the System Catalog

Extends `02-hospital-onboarding.md` §3 step 4 ("seed reference data"). At org creation, seed the
full platform department catalog (enabled/disabled per `businessType` — a standalone Pharmacy
starts with only its relevant departments active, but the rows exist either way so enabling more
later never requires new `systemKey`s):

| `businessType` | Seeded departments (enabled by default) |
|---|---|
| `HOSPITAL` | Reception, Emergency, Outpatient, Nursing, Pharmacy, Laboratory, Radiology, Theatre, ICU, Pediatrics, Cardiology, Neurology, Orthopedics, Dental, Physiotherapy, Medical Records, Accounts, HR |
| `LABORATORY` | Reception, Laboratory, Accounts |
| `PHARMACY` | Reception, Pharmacy, Accounts |

All other catalog departments are still seeded as rows (`isActive = false`) so a tenant can enable
one later without a schema change — e.g. a growing Laboratory business enabling Radiology.

Each enabled department seeds its own default `Queue` rows — genuinely distinct physical or
operational stations only, not every visit type or sub-reason a patient might have:

| Department | Seeded queues |
|---|---|
| Emergency | Emergency Queue, Resuscitation Queue, Triage Queue, Observation Queue |
| Outpatient | General Consultation |
| Laboratory | Sample Collection, Hematology, Chemistry, Result Verification |
| Radiology | X-Ray, Ultrasound, CT Scan |
| Pharmacy | Dispensing |
| *(others)* | One default queue matching the department name, until that department's own clinical-flow PRD refines it |

Outpatient seeds a single queue, not one per visit reason — General Consultation, Follow-up, and
Walk-in visits are the same doctor and the same worklist; they differ only in `Appointment.reason`
(§2.2), not in which physical queue the patient sits in. Pharmacy seeds only Dispensing — stock
management isn't a patient/object worklist; it's a data-management concern owned by the future
Pharmacy & Inventory PRD, not a `Queue` here.

Admins can rename or deactivate (`isActive = false`) departments and queues after onboarding —
they cannot create new ones (§4). A hospital that doesn't run Theatre yet simply leaves it
disabled; the row and its queues already exist, ready to enable when it does.

## 4. APIs

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v1/departments` | GET | admin | List the org's department catalog (all seeded rows, active or not) |
| `/api/v1/departments/:id` | PATCH | admin | Rename (`name`) or enable/disable (`isActive`) — **no create, no delete**: the catalog is fixed |
| `/api/v1/departments/:id/queues` | GET | admin | List a department's queues |
| `/api/v1/queues/:id` | PATCH | admin | Rename or enable/disable a queue — same no-create/no-delete rule |
| `/api/v1/staff/:id/department` | PATCH | admin | Assign/reassign a staffer's `departmentId` |

## 5. Why / Where / Why Not

- **Why Department/Queue carry no permissions of their own** — permissions live in `DutyProfile`
  (`05`). Letting Department/Queue also gate access would mean every authorization check
  reconciles two independent systems. They answer a different question entirely:
  routing/scoping, not authorization.
- **Why Department and Queue are system-seeded, not tenant-creatable** — both are load-bearing
  identities that other parts of the system key off (reports, inventory, referrals, `DutyProfile`
  in `05`). An arbitrary tenant-invented department or queue wouldn't have any of that machinery
  behind it — it would just be a label. Renaming (`name`) covers the real need (different hospitals
  call the same thing different things) without the semantic risk of tenants inventing types the
  rest of the system doesn't understand.
- **Why a queue means a distinct station, not a visit type** — modeling every visit reason as its
  own queue would fragment one doctor's single worklist for no operational reason, and would
  duplicate what `Appointment.reason` already captures. A queue should map to something with its
  own physical or operational identity (a room, a bench, a station) — not to metadata about why a
  patient is in it.
- **Why org-scoped, not branch-scoped** — a chain's branches overwhelmingly run the same
  department structure (every branch has a Pharmacy, a Laboratory, etc.); modeling per-branch
  department catalogs would mean an activation matrix for a case that's the exception, not the
  rule. See §6 for the deferred alternative if a real chain needs it.
- **Why `departmentId` is nullable** — forcing every `Staff` row to have a department from day one
  would block onboarding staff before department setup is complete, which fights the product's
  "core works, build out progressively" philosophy used everywhere else in this PRD set.
- **Why Department → Queue is a flat two-level structure, not a deeper hierarchy** — no
  queue-of-a-queue, no department sub-groups. Real operational nuance below a queue (e.g. priority
  ordering within Emergency Queue) is a queue-*behavior* concern owned by whichever clinical-flow
  PRD implements that queue's mechanics, not a deeper catalog structure here.

## 6. Explicitly Out of Scope for v1

- **Per-branch department/queue activation** — a chain where Branch A runs Radiology but Branch B
  doesn't. Would need `BranchDepartment`/`BranchQueue` join tables (`branchId, departmentId/queueId,
  isActive`) layered on top of this design without changing `Department`/`Queue`/`Staff` —
  deferred until a real chain needs it, not designed here.
- **Which staffer sees which queue** — that's the whole subject of
  `05-access-control-clinical-scoping.md` (`DutyProfile`). This document only guarantees the
  catalog data — `Department`, `Queue`, `staff.departmentId` — that `05` scopes access against.
- **Department/queue-based reporting/analytics** (e.g. "revenue by department") — a reporting
  concern, deferred to whichever PRD covers admin/reporting.
