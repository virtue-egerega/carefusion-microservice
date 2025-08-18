# Feature PRD — Access Control & Clinical Scoping

Status: Draft · Last updated: 2026-07-05
Depends on: `04-departments.md` (`Department`, `Queue`, `Staff`), `02-hospital-onboarding.md`
(`Branch`), `Patient`.
Referenced by: the User Management feature (not yet numbered); the Appointment/OPD booking
feature (§6).

Scope note: this document covers the **core** access-control structure only — `Role`,
`Permission`, `DutyProfile`, and assigning `DutyProfile`s to staff. Individual, one-off overrides
(a single extra permission or queue for one staffer with no bundle behind it) are a separate
feature, not designed here.

## 1. What Problem This Solves

`Role` answers **who** this person is (Doctor, Nurse, Pharmacist...). `Department`/`Queue` (`04`)
answer **where** they work and on which specific worklist. Neither, on their own, answers **what**
they're allowed to do there, or **which patients** they can see right now. Two more things are
true of real hospitals that the design has to hold at once:

- The same `Role` in different departments needs different queues and different permissions — a
  Gyno Nurse and an Emergency Nurse don't share a scope of practice, and an Ophthalmologist has no
  business browsing Gynecology patients.
- **People routinely hold more than one job at once.** Mary is a Gyno Nurse *and*, this month,
  Acting Ward Manager. Dr. James is an Emergency Doctor *and* covers ICU on weekends. Neither
  should require editing anyone's base role, department, or a shared bundle everyone else also
  uses — access has to be **additive**.

The model:

```
Role         → professional identity (Doctor, Nurse...) (§2)
Department   → organizational unit (04)
Queue        → operational worklist, owned by a Department (04)
Permission   → a system-defined capability (§3)
DutyProfile  → a reusable bundle: role + department + queues (M:N) + permissions (M:N) (§4)
Staff        → holds one or more DutyProfiles, stacked and additive (§5)
```

A `DutyProfile` is a named, reusable job description — "Gyno Nurse," "Ward Manager," "Pain
Doctor" — built once per (role, department) combination an org actually uses, then assigned to
however many staff hold that job. A staffer's effective queues and permissions are the **union**
of every `DutyProfile` they hold.

## 2. `Role`

```prisma
model Role {
  id          String @id @default(uuid())
  name        String @unique   // e.g. "Doctor", "Nurse", "Pharmacist", "Administrator"
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`Role` is purely identity here — a name and nothing else. It grants no permissions on its own
(§8) and carries no department or queue information; every staff member holds exactly one `Role`,
and `DutyProfile.roleId` (§4) references this same table.

## 3. `Permission`

```prisma
model Permission {
  id          String @id @default(uuid())
  key         String @unique       // e.g. "patient.view", "prescription.dispense", "vitals.enter"
  description String?
}
```

System-owned and immutable — seeded in code/migration, never tenant-created. A tenant chooses
*which* permissions a `DutyProfile` grants; it never invents a new permission key.

## 4. `DutyProfile`

```prisma
model DutyProfile {
  id           String    @id @default(uuid())
  name         String    @unique          // e.g. "Gyno Nurse", "Ward Manager", "Pain Doctor"
  roleId       String                     // Role.id — which role this bundle is written for
  departmentId String?                    // Department.id — null only for department-less global bundles (§7)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  updatedBy    String?
  deletedAt    DateTime?
  deletedBy    String?

  role         Role        @relation(fields: [roleId], references: [id], onDelete: Cascade)
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  queues       DutyProfileQueue[]
  permissions  DutyProfilePermission[]
  staff        StaffAssignment[]
}

model DutyProfileQueue {
  id            String @id @default(uuid())
  dutyProfileId String
  queueId       String

  dutyProfile   DutyProfile @relation(fields: [dutyProfileId], references: [id], onDelete: Cascade)
  queue         Queue       @relation(fields: [queueId], references: [id], onDelete: Cascade)

  @@unique([dutyProfileId, queueId])
}

model DutyProfilePermission {
  id            String @id @default(uuid())
  dutyProfileId String
  permissionId  String

  dutyProfile   DutyProfile @relation(fields: [dutyProfileId], references: [id], onDelete: Cascade)
  permission    Permission  @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([dutyProfileId, permissionId])
}
```

Example: the "Gyno Nurse" `DutyProfile` — `role = Nurse`, `department = Gynecology`, queues
`{ANC, Labour}`, permissions `{patient.view, vitals.record, nursing_note.create}`. A separate
"Ward Manager" profile — `role = Nurse`, `department = Gynecology`, queues `{Ward Review}`,
permissions `{approve.discharge, assign.staff, manage.beds}`. Any nurse can hold either, both, or
neither; the bundle exists once and is assigned, not copied per person.

A profile's permissions apply within that profile's own queues — "Emergency Doctor" grants
`{diagnose, prescribe, admit}` usable in `{Emergency Queue, Observation Queue}`, not everywhere.
`departmentId` is nullable specifically for the department-less, queue-less global case (§7,
Hospital Administrator) — a profile with no queues attached grants its permissions unconditionally
rather than gating them to a queue that doesn't exist for that bundle.

## 5. Assigning `DutyProfile`s to Staff

```prisma
model StaffAssignment {
  id            String    @id @default(uuid())
  staffId       String
  dutyProfileId String
  assignedBy    String
  assignedAt    DateTime  @default(now())
  endsAt        DateTime?                     // null = standing; set for a time-boxed "acting" assignment

  staff         Staff       @relation(fields: [staffId], references: [id], onDelete: Cascade)
  dutyProfile   DutyProfile @relation(fields: [dutyProfileId], references: [id], onDelete: Cascade)

  @@unique([staffId, dutyProfileId])
}
```

Many-to-many: Mary holds `Gyno Nurse` and, for the duration of `endsAt`, `Ward Manager` too — both
active simultaneously, no new bundle created for the combination. Dr. James holds `Emergency
Doctor` and `ICU Doctor` the same way, permanently (`endsAt` null).

**Effective queues and permissions for staffer S:**

```
grantedQueues(S) = ∪ (queues of every DutyProfile in S's active StaffAssignment rows)

grantedPermissions(S, queue Q) =
    ∪ (permissions of every DutyProfile assigned to S whose queues include Q)
```

## 6. Patient-Level Scoping: `PatientAssignment`

Queues and permissions together decide "can S act on patients in this queue, and how." They don't
cover the one-off case where a specific patient needs to be seen by a specific person, department,
or branch outside their normal scope (a referral to a named specialist, a second opinion, a
consult request, or a patient whose care is now also needed at a branch other than the one they
registered at). That's a separate, explicit, auditable grant:

```prisma
model PatientAssignment {
  id           String   @id @default(uuid())
  patientId    String
  staffId      String?                      // grant to one specific staffer...
  departmentId String?                      // ...OR to a whole department (e.g. "refer to Ophthalmology")...
  branchId     String?                      // ...OR to a whole other branch (e.g. patient now also seen at Branch B)
  grantedBy    String
  reason       PatientAssignmentReason
  note         String?
  expiresAt    DateTime?
  revokedAt    DateTime?
  createdAt    DateTime @default(now())

  patient      Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  staff        Staff?         @relation(fields: [staffId], references: [id], onDelete: Cascade)
  department   Department?    @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  branch       Branch?        @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@index([patientId])
  @@index([staffId])
  @@index([departmentId])
  @@index([branchId])
}

enum PatientAssignmentReason {
  REFERRAL
  CONSULT_REQUEST
  COVERING_SHIFT
  BRANCH_SHARE
  OTHER
}
```

Exactly one of `staffId` / `departmentId` / `branchId` is set — never more than one, never none
(enforced at the service layer; Prisma has no native XOR constraint). Granting to a department
(not yet a named staffer) matches how referrals are actually initiated ("refer to Ophthalmology,"
to be picked up by whoever's on duty there); granting to a specific staffer matches a named
consult; granting to a branch (`reason = BRANCH_SHARE`) is what makes a branch-scoped `Patient`
(`02` §2.2) visible at a branch other than the one they registered at — once granted, ordinary
`DutyProfile`/queue rules at the receiving branch govern what staff there can actually see and do,
exactly as if the patient had registered there.

This is the intra-organization counterpart to `03-federation-patient-sharing.md`'s `PatientShare`
— the same underlying problem (an explicit, time-boxable, revocable access grant with a reason) one
level down: within one organization instead of between two.

**Trigger from booking a referral appointment**: booking an appointment with a referring staffer
and a receiving doctor outside the referring staffer's department should also create a
`PatientAssignment(reason=REFERRAL, staffId=<receiving doctor>, grantedBy=<referring staffer>)`.
That integration point belongs to whichever feature formalizes appointment booking — noted here so
it isn't missed, not implemented in this document.

Manual grants (an ad hoc "let Dr. X see this patient" with no appointment involved) use this same
table directly, typically `reason=CONSULT_REQUEST` or `OTHER`.

## 7. Effective Access Rule

Whether staffer S may perform an action requiring `Permission` P against patient P′, currently in
queue Q:

1. P is in `grantedPermissions(S, Q)` (§5), **and**
2. At least one of:
   - Q is in `grantedQueues(S)` (§5), **or**
   - An active `PatientAssignment` (`revokedAt` null, `expiresAt` null or in the future) names S
     directly, or names S's department.

Both conditions are required and deliberately independent: condition 1 alone would let S act on
any patient regardless of whether that patient is even in front of them; condition 2 alone would
let anyone whose queue happens to include a patient act on them with no permission check. Seeing a
queue and having permission within it are never the same fact.

**Hospital Administrator dashboards** use this same rule with no new mechanism: an "Administrator"
`DutyProfile` with `departmentId = null` and no queues, carrying permissions like `report.view` /
`operationalMetrics.view`. Since it has no queues, §5's permission rule treats those permissions as
unconditional — the administrator gets cross-department visibility into *aggregates* this way, and
this section's rule still governs whether they can open any individual patient's record (a
different `Permission` key entirely).

## 8. Why / Where / Why Not

- **Why a reusable `DutyProfile` bundle instead of per-(department, role, queue) rows** — hospitals
  constantly need exceptions (an acting manager, a weekend ICU cover). A bundle assigned
  many-to-many to staff lets those exceptions stack on top of a base job without ever editing the
  base job everyone else with that title also relies on.
- **Why `StaffAssignment` is many-to-many, not one profile per staffer** — the alternative means
  every exception (Mary's acting management, Dr. James's weekend ICU cover) forces either a brand
  new combined profile (`Gyno Head Nurse`) that has to be maintained forever, or editing the shared
  base profile for one person's temporary situation.
- **Why permissions live only in `DutyProfile`, never in `Role` directly** — a role's real-world
  authorized actions legitimately vary by department and by which bundles a person holds; `Role`
  alone has no department/queue context to vary by.
- **Why `DutyProfilePermission` is scoped to the profile's own queues** — a bundle's permissions
  describe a job done *somewhere specific*, not a floating capability usable anywhere.
- **Why `PatientAssignment` can target a department, not only a named staffer** — real referrals
  are frequently made to a department before anyone is named ("send to Ophthalmology"), not
  necessarily to a specific doctor.
- **Why branch-sharing reuses `PatientAssignment` instead of a separate table** — it's the same
  underlying shape (an explicit, auditable, revocable grant with a reason) one level coarser than
  a department grant; adding a third optional target field costs nothing that a whole new
  mechanism wouldn't have cost more.

## 9. Explicitly Out of Scope for v1

- **Individual overrides** — a single extra permission or queue granted to one staffer with no
  `DutyProfile` behind it (e.g., one pharmacist approving controlled drugs, one doctor getting a
  single extra permission once). Real need, deliberately a separate feature built on top of this
  core structure, not designed in this document.
- **Automatic expiry/cleanup jobs** for `PatientAssignment.expiresAt` or expired
  `StaffAssignment` rows — flagged as needed before this handles high volume, not built here.
- **Bulk/team-level assignment** (e.g., granting an entire nursing shift a profile at once) — v1
  only supports single-staffer `DutyProfile` assignment.
- **Role catalog management** (creating/editing roles, MFA, sessions, audit/activity logs) —
  the User Management feature's job, not this document's.
- **A doctor's clinical specialty as its own catalog concept** outside of `Department` — flagged as
  a cleanup item for whichever feature consolidates specialty/clinic modeling, not touched here.
