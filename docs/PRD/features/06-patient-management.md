# Feature PRD — Patient Management

Status: Draft · Last updated: 2026-07-05
Depends on: `02-hospital-onboarding.md` (`Branch`), `05-access-control-clinical-scoping.md`
(`PatientAssignment`, for cross-branch sharing).
Referenced by: `07-appointment-management.md`, `08-electronic-medical-records.md`,
`03-federation-patient-sharing.md` (inbound shares match/create a `Patient` here).

Scope note: insurance is deliberately absent from this document — it lands with the Billing
feature. Patient Timeline (§6) is specified only as a thin, growing read view; it has no data of
its own to design around until Appointment/EMR/Admission exist.

## 1. What Problem This Solves

Every other clinical feature — appointments, consultations, admissions, lab orders — points at a
`Patient`. Getting this record right, and getting a person *into* it correctly, matters more than
almost anything else in the system: a hospital that ends up with the same person registered five
times under slightly different name spellings has a real, ongoing operational problem, not a
cosmetic one. This document's two jobs are the patient record itself (§2) and the identification
process that keeps one person as one record (§3–§4).

`Patient` is scoped to a `Branch` (`02` §2.2) — a patient belongs to the branch they registered
at, and isn't visible from another branch unless explicitly shared (`05` §6).

## 2. Data Model

### 2.1 `Patient`

| Field | Type | Constraints | Why |
|---|---|---|---|
| `mrn` | `String` | unique across the org | Human-readable identifier — printed on cards, read aloud, searched by reception |
| `branchId` | `String` | required | Registering/home branch (`02` §2.2) |
| `firstName`, `middleName?`, `lastName` | `String` | required (except middle) | |
| `dateOfBirth` | `Date` | required | |
| `sex` | enum (`MALE`, `FEMALE`) | required | Biological sex, distinct from any gender-identity field a future profile might add |
| `phone` | `String[]` | at least one, unless `OTHER` | |
| `email` | `String?` | optional | |
| `nationalId` | `String?` | optional, unique if present | Government ID number, when the patient has one |
| `bloodGroup` | enum (`A_POS`...`O_NEG`) | optional | Often unknown at registration; filled in later |
| `photo` | `String?` | optional | Reference to a stored image, for visual ID at the desk |
| `status` | enum (`ACTIVE`, `INACTIVE`, `DECEASED`) | default `ACTIVE` | |
| `createdAt`, `updatedAt`, `updatedBy`, `deletedAt`, `deletedBy` | — | — | Standard audit fields |

```prisma
model Patient {
  id          String       @id @default(uuid())
  mrn         String       @unique
  branchId    String
  firstName   String
  middleName  String?
  lastName    String
  dateOfBirth DateTime
  sex         Sex
  phone       String[]
  email       String?
  nationalId  String?      @unique
  bloodGroup  BloodGroup?
  photo       String?
  status      PatientStatus @default(ACTIVE)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  updatedBy   String?
  deletedAt   DateTime?
  deletedBy   String?

  branch          Branch                     @relation(fields: [branchId], references: [id])
  contacts        PatientContact[]
  allergies       PatientAllergy[]
  chronicConditions PatientChronicCondition[]
  disabilities    PatientDisability[]
  profile         PatientProfile?

  @@index([branchId])
  @@index([lastName, firstName, dateOfBirth])
}

enum Sex {
  MALE
  FEMALE
}

enum PatientStatus {
  ACTIVE
  INACTIVE
  DECEASED
}

enum BloodGroup {
  A_POS
  A_NEG
  B_POS
  B_NEG
  AB_POS
  AB_NEG
  O_POS
  O_NEG
}
```

Child tables below (`PatientContact`, `PatientAllergy`, etc.) carry no `branchId` of their own —
they're only ever reached by joining through `patientId`, so `Patient`'s own Row-Level Security
(`02` §2.3) already gates them. Duplicating `branchId` onto every child table would be redundant
enforcement of the same fact.

### 2.2 `PatientContact` (next of kin / emergency contact)

```prisma
model PatientContact {
  id           String      @id @default(uuid())
  patientId    String
  name         String
  relationship String                          // e.g. "Spouse", "Sibling", "Parent"
  phone        String[]
  address      String?
  roles        ContactRole[]                   // one contact can be both next-of-kin and emergency contact
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  patient      Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
}

enum ContactRole {
  NEXT_OF_KIN
  EMERGENCY_CONTACT
  OTHER
}
```

A patient can have more than one contact (a next-of-kin who's a spouse, a separate emergency
contact who's a sibling); `roles` is a list rather than a boolean-per-role because the same
person frequently fills both.

### 2.3 `PatientAllergy`, `PatientChronicCondition`, `PatientDisability`

```prisma
model PatientAllergy {
  id           String   @id @default(uuid())
  patientId    String
  substance    String                          // e.g. "Penicillin", "Peanuts"
  severity     AllergySeverity
  reactionNote String?
  recordedAt   DateTime @default(now())
  recordedBy   String

  patient      Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
}

enum AllergySeverity {
  MILD
  MODERATE
  SEVERE
}

model PatientChronicCondition {
  id            String    @id @default(uuid())
  patientId     String
  condition     String                         // e.g. "Type 2 Diabetes", "Hypertension"
  diagnosedDate DateTime?
  notes         String?
  recordedAt    DateTime  @default(now())
  recordedBy    String

  patient       Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
}

model PatientDisability {
  id         String   @id @default(uuid())
  patientId  String
  type       String                            // e.g. "Visual impairment", "Mobility impairment"
  notes      String?
  recordedAt DateTime @default(now())
  recordedBy String

  patient    Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
}
```

Free-text `substance`/`condition`/`type` rather than a system catalog (unlike `Department`/
`Queue`/`Permission`) — allergies and conditions are open-ended clinical facts a system-defined
list can't realistically enumerate up front, not structural identities the rest of the system
routes around.

### 2.4 `PatientProfile` (deeper clinical history)

Captured over time by clinical staff, not necessarily at first registration — distinct from the
registration fields above, which reception captures on day one.

```prisma
model PatientProfile {
  id                String    @id @default(uuid())
  patientId         String    @unique
  familyHistory     String?
  surgicalHistory    String?
  vaccinationHistory String?
  smokingStatus      LifestyleStatus?
  alcoholStatus      LifestyleStatus?
  pregnancyHistory   String?
  riskFactors        String?
  updatedAt          DateTime @updatedAt
  updatedBy          String?

  patient           Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
}

enum LifestyleStatus {
  NEVER
  FORMER
  CURRENT
  UNKNOWN
}
```

One row per patient, filled in progressively — never all populated at once, and never required to
create a `Patient` in the first place (§4).

### 2.5 `PatientRelationship` (linking one patient to another)

```prisma
model PatientRelationship {
  id                String   @id @default(uuid())
  patientId         String
  relatedPatientId  String
  relationshipType  RelationshipType
  isPrimaryGuardian Boolean  @default(false)
  createdAt         DateTime @default(now())
  createdBy         String

  patient        Patient @relation("PatientRelationships", fields: [patientId], references: [id], onDelete: Cascade)
  relatedPatient Patient @relation("RelatedToPatient", fields: [relatedPatientId], references: [id], onDelete: Cascade)

  @@unique([patientId, relatedPatientId])
}

enum RelationshipType {
  PARENT
  CHILD
  GUARDIAN
  SPOUSE
  SIBLING
  OTHER
}
```

Distinct from `PatientContact` (§2.2): this links two *actual* `Patient` rows already in the
system — for structured lookups (pulling up a linked relative's relevant history, or finding who
has consent authority for a minor). `PatientContact` is unstructured by comparison — a name and
phone number that may not correspond to any `Patient` row at all.

**Minor consent**: for a patient under a configurable age threshold, an action requiring consent
looks for a `PatientRelationship` row with `isPrimaryGuardian = true` to identify who consents on
their behalf — reusing this model rather than building a separate consent-authority mechanism.
Capturing the consent itself (signature, OTP, verbal-logged) is not designed here; only
*identifying* who's authorized to give it.

### 2.6 `PatientAccount` (the "Family Card" — shared billing/tracking group)

```prisma
model PatientAccount {
  id          String   @id @default(uuid())
  cardNumber  String   @unique              // the physical/printed family-card number
  accountType AccountType
  name        String                        // e.g. "The Okafor Family", "Acme Corp Staff"
  status      AccountStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     PatientAccountMember[]
}

enum AccountType {
  FAMILY
  ORGANIZATION
}

enum AccountStatus {
  ACTIVE
  INACTIVE
}

model PatientAccountMember {
  id        String   @id @default(uuid())
  accountId String
  patientId String
  joinedAt  DateTime @default(now())

  account   PatientAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  patient   Patient        @relation(fields: [patientId], references: [id])

  @@unique([accountId, patientId])
}
```

A patient belongs to at most one `PatientAccount` at a time — one physical card. `accountType`
covers both a biological/marital family and a company registering its staff under one account:
same structure, different reason for being grouped. This is a **grouping** concept, separate from
`PatientRelationship` — being on the same family card doesn't require a recorded PARENT/CHILD/
SPOUSE relationship between members (a company's staff account has none at all), and a formally
recorded guardian relationship doesn't require both people to share a billing account either.
This document defines only the grouping structure: which patients belong to which account. Shared
billing balances, invoicing against the account, and insurance policies that cover an entire
account are the Billing feature's job, not designed here.

## 3. Identification & Duplicate Prevention

The single most important operational control in this document: **search before create.**
Reception never gets a blank "register new patient" button as the first step — they get a search
box. Search runs against `firstName`/`lastName` (fuzzy), `dateOfBirth`, `phone`, and `nationalId`,
and returns candidate matches for a human to confirm or rule out, because two different people
sharing a name is routine, not an edge case, and creating a new record is the one mistake that's
expensive to undo later (split history, missed allergies, duplicate billing).

`mrn` generation: assigned at creation, branch-code-prefixed plus a sequential number (e.g.
`MAIN-000123`) — human-readable enough to read aloud or print on a card, globally unique across
the org so it stays a stable identifier even after a cross-branch share (`05` §6).

## 4. Registration Process

1. **Search** — reception searches by name/DOB/phone/national ID (§3). Results (if any) are
   candidate matches, not automatic — a human confirms.
2. **Match confirmed** — no new `Patient` created. Proceed directly to whatever brought the
   patient in today (an `Appointment`, `07`); contact info is offered for an update, not
   re-collected from scratch.
3. **No match / match ruled out** — full registration: demographics, contact numbers, at least one
   `PatientContact`, national ID if available, blood group if known, allergies/chronic
   conditions/disabilities if disclosed. None of §2.4's `PatientProfile` fields are required at
   this step.
4. Either path converges on the same next step: proceed to `07-appointment-management.md` to
   create today's visit.

**Newborn registration** is a distinct case that skips step 1 entirely — there's nothing to
search for. A baby born in the hospital gets a minimal `Patient` created immediately: a temporary
name (e.g. "Baby of `<mother's name>`"), `dateOfBirth` set to the time of birth, `sex` required,
`nationalId`/`phone`/`email` left null. The record is linked to the mother via
`PatientRelationship(relationshipType=CHILD, relatedPatientId=<mother>)` (and the reciprocal
`PARENT` row), and is typically added as a `PatientAccountMember` to the mother's existing
`PatientAccount`, if she has one. The name and any identifiers are filled in later as an update to
this same record — not a new registration once they're known.

## 5. Cross-Branch Sharing

A patient registered at Branch A who needs to be seen at Branch B requires an explicit
`PatientAssignment(reason=BRANCH_SHARE, branchId=<Branch B>)` (`05` §6) before Branch B's staff can
see them at all — there is no default cross-branch visibility. Once granted, ordinary
`DutyProfile`/queue rules at Branch B govern what its staff can actually see and do, exactly as if
the patient had registered there.

## 6. Patient Timeline

A read-only, chronological aggregation of everything that's happened to a patient — visits,
diagnoses, medications, lab tests, imaging, procedures, admissions, payments — pulled from
whichever features own that data (`07`, `08`, and future Admission/Lab/Radiology/Billing PRDs).
This document only reserves the concept; there's nothing to design in `Patient` itself for it, and
the view necessarily grows thinner or richer as those other features ship. Not a table — a query
across tables that don't all exist yet.

## 7. APIs

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v1/patients/search` | GET | reception/clinical staff | Query params: `name?, dateOfBirth?, phone?, nationalId?` — candidate matches for §3/§4 step 1 |
| `/api/v1/patients` | POST | reception | Register a new patient (§4 step 3) |
| `/api/v1/patients/:id` | GET / PATCH | staff with visibility (`05` §7) | Read/update core record |
| `/api/v1/patients/:id/contacts` | POST / GET | reception/clinical staff | Manage `PatientContact` rows |
| `/api/v1/patients/:id/allergies` | POST / GET | clinical staff | Manage `PatientAllergy` rows |
| `/api/v1/patients/:id/chronic-conditions` | POST / GET | clinical staff | Manage `PatientChronicCondition` rows |
| `/api/v1/patients/:id/disabilities` | POST / GET | clinical staff | Manage `PatientDisability` rows |
| `/api/v1/patients/:id/profile` | GET / PATCH | clinical staff | Read/update `PatientProfile` |
| `/api/v1/patients/:id/relationships` | POST / GET | reception/clinical staff | Link/list `PatientRelationship` rows |
| `/api/v1/patient-accounts` | POST / GET | reception/billing staff | Create/list `PatientAccount` ("Family Card") rows |
| `/api/v1/patient-accounts/:id/members` | POST / GET / DELETE | reception/billing staff | Add/list/remove `PatientAccountMember` rows |
| `/api/v1/patients/:id/timeline` | GET | staff with visibility | §6 aggregation |

## 8. Why / Where / Why Not

- **Why search-before-create is mandatory, not a nice-to-have** — the cost of a false negative
  (missing an existing record, creating a duplicate) is far higher than the cost of a receptionist
  spending a few extra seconds confirming a match. Any flow that lets "create new" be the first
  button pressed will accumulate duplicate patients.
- **Why registration and profile are separate models (`Patient`/contacts/allergies vs.
  `PatientProfile`)** — registration happens once, fast, at a desk; profile fields accumulate over
  weeks of clinical encounters and are frequently unknown at first visit. Forcing them into one
  required-at-creation shape would either block registration on facts nobody has yet, or leave a
  wide, permanently-half-empty `Patient` table.
- **Why allergies/conditions/disabilities are free text, not system catalogs** — unlike
  `Department`/`Queue`, nothing else in the system routes behavior off a specific allergy's
  identity; a fixed enum would only ever be incomplete for a clinically open-ended domain.
  (Revisit if a future drug-interaction-checking feature needs allergies to key off a real
  substance catalog — flagged, not solved here.)
- **Why child tables (contacts, allergies, etc.) carry no `branchId`** — they're never queried
  except through `patientId`, so `Patient`'s own branch scoping already governs their visibility;
  adding `branchId` to each would be the same fact enforced twice.
- **Why cross-branch sharing is a grant, not a setting** — matches how `05` already treats every
  other exception to default scoping: explicit, auditable, revocable, rather than a toggle that's
  easy to forget was ever flipped on.
- **Why `PatientRelationship` is a separate model from `PatientContact`** — a next-of-kin or
  emergency contact is frequently someone with no `Patient` record at all; a structured, queryable
  link (for consent authority, for pulling a relative's actual history) only makes sense when the
  other person genuinely is a patient in this system. Conflating the two would force every contact
  to either be a full patient record or lose the structured lookup capability.
- **Why `PatientAccount` is a separate model from `PatientRelationship`** — a billing/tracking
  group and a clinical/consent relationship answer different questions and don't always coincide
  (a company's staff account has no family relationships between members; a formally-recorded
  guardian doesn't necessarily share a bill with their ward). Merging them would mean an org's
  staff-account members show up as "family," or a billing group can't exist without inventing
  fictitious relationship types.

## 9. Explicitly Out of Scope for v1

- **Insurance, and all billing/invoicing mechanics for `PatientAccount`** — deliberately excluded;
  land with the Billing feature. This document only defines who's grouped under which account.
- **Formal consent-capture workflow** (signature, OTP, verbal-logged) — `PatientRelationship.
  isPrimaryGuardian` only identifies *who* is authorized to consent; capturing an actual consent
  event is a different feature's job (the same shape of problem `03`'s `PatientShare.consentMethod`
  already solves for cross-org sharing — not duplicated here).
- **Identity-document scanning/OCR, biometric matching** — search is manual (staff-confirmed), not
  automated fuzzy-matching beyond simple field queries. A real risk area for future improvement,
  not solved here.
- **Merging two patient records discovered to be duplicates after the fact** — no merge tool
  designed here; a real gap once duplicates inevitably occur despite §3.
- **Patient self-service** (portal login, viewing their own timeline) — this document defines the
  record; who else besides staff can access it is a User Management/authentication concern, not
  designed here.
