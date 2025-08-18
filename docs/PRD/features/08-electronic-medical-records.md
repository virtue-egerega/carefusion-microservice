# Feature PRD — Electronic Medical Records (EMR)

Status: Draft · Last updated: 2026-07-05
Depends on: `06-patient-management.md` (`Patient`), `07-appointment-management.md`
(`Appointment`), `05-access-control-clinical-scoping.md` (`DutyProfile` permissions gate every
action below).
Referenced by: future Pharmacy, Laboratory, and Radiology features (they fulfill the orders
created here).

## 1. What Problem This Solves

Once a patient reaches a doctor or nurse in a queue (`04`), something clinical has to actually get
recorded. Three related but distinct kinds of record, plus one cross-cutting concern:

- **Consultation** (§2) — the doctor's structured encounter note.
- **Vitals** (§3) — nursing measurements taken during a visit.
- **Clinical Notes** (§4) — freeform notes and attachments not tied to a full consultation.
- **Orders** (§5) — prescriptions, lab requests, imaging requests *created* here, *fulfilled*
  elsewhere — the same ordering/fulfillment split `01-application-flow.md` already establishes for
  every other department.

## 2. `Consultation`

```prisma
model Consultation {
  id                  String   @id @default(uuid())
  appointmentId       String   @unique
  patientId           String
  doctorId            String
  chiefComplaint      String
  presentIllness      String?
  reviewOfSystems     String?
  physicalExamination String?
  assessment          String?
  treatmentPlan       String?
  notes               String?
  status              ConsultationStatus @default(DRAFT)
  signedAt            DateTime?
  signedBy            String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  appointment         Appointment @relation(fields: [appointmentId], references: [id])
  patient             Patient     @relation(fields: [patientId], references: [id])
  doctor              Staff       @relation(fields: [doctorId], references: [id])
  diagnoses           Diagnosis[]

  @@index([patientId])
}

enum ConsultationStatus {
  DRAFT
  SIGNED
}
```

One `Consultation` per `Appointment` — the structured record of that specific encounter.
`status` starts `DRAFT` while the doctor is writing; once `SIGNED`, the record is immutable (§6)
— a real clinical/legal requirement, not a data-integrity nicety. Corrections after signing are a
new `ClinicalNote` addendum (§4), never an edit to signed content.

### 2.1 `Diagnosis`

```prisma
model Diagnosis {
  id             String   @id @default(uuid())
  consultationId String
  codeSystem     DiagnosisCodeSystem
  code           String
  description    String
  isPrimary      Boolean  @default(false)
  recordedAt     DateTime @default(now())

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  @@index([consultationId])
}

enum DiagnosisCodeSystem {
  ICD_10
  ICD_11
}
```

A consultation can carry multiple diagnoses (one `isPrimary`, others secondary). Both ICD-10 and
ICD-11 are supported as coexisting code systems — real installs transition between them at
different times, and forcing one wouldn't match how coding actually happens on the ground.

## 3. `Vitals`

```prisma
model Vitals {
  id                     String   @id @default(uuid())
  appointmentId          String
  patientId              String
  height                 Decimal?
  weight                 Decimal?
  bmi                    Decimal?                    // computed at write time from height/weight
  bloodPressureSystolic  Int?
  bloodPressureDiastolic Int?
  pulse                  Int?
  oxygenSaturation       Decimal?
  temperature            Decimal?
  respiratoryRate        Int?
  recordedBy             String
  recordedAt             DateTime @default(now())

  appointment            Appointment @relation(fields: [appointmentId], references: [id])
  patient                Patient     @relation(fields: [patientId], references: [id])

  @@index([patientId])
  @@index([appointmentId])
}
```

Tied to a specific `Appointment` — v1 covers vitals taken during an outpatient visit. Continuous,
ward-based vitals monitoring for admitted patients is a different operational pattern, owned by
the future Admission feature (§7).

## 4. `ClinicalNote`

```prisma
model ClinicalNote {
  id             String   @id @default(uuid())
  patientId      String
  consultationId String?                     // optional — a note can exist without a full consultation
  noteType       ClinicalNoteType
  content        String
  createdBy      String
  createdAt      DateTime @default(now())

  patient        Patient       @relation(fields: [patientId], references: [id])
  consultation   Consultation? @relation(fields: [consultationId], references: [id])
  attachments    ClinicalNoteAttachment[]

  @@index([patientId])
}

enum ClinicalNoteType {
  SOAP_SUBJECTIVE
  SOAP_OBJECTIVE
  SOAP_ASSESSMENT
  SOAP_PLAN
  GENERAL
}

model ClinicalNoteAttachment {
  id             String   @id @default(uuid())
  clinicalNoteId String
  fileUrl        String
  fileType       AttachmentType
  uploadedAt     DateTime @default(now())

  clinicalNote   ClinicalNote @relation(fields: [clinicalNoteId], references: [id], onDelete: Cascade)
}

enum AttachmentType {
  IMAGE
  AUDIO
  DOCUMENT
}
```

Separate from `Consultation` on purpose: a nurse's shift note, a quick addendum to an already
-signed consultation, or a SOAP-structured note taken independent of a formal encounter shouldn't
require creating (or reopening) a full `Consultation` record. Voice dictation is stored as an
`AUDIO` attachment — transcription to text is a future concern, not designed here (§7).

## 5. Orders: `Prescription`, `LabOrderRequest`, `ImagingOrderRequest`

Each order records **what was requested and why** — fulfillment (dispensing, sample collection,
imaging execution) belongs to the Pharmacy, Laboratory, and Radiology features respectively, which
reference these rows rather than duplicating what was ordered.

```prisma
model Prescription {
  id             String   @id @default(uuid())
  consultationId String
  patientId      String
  medicationName String
  dosage         String
  frequency      String
  duration       String
  route          String?
  instructions   String?
  status         OrderStatus @default(ORDERED)
  prescribedBy   String
  prescribedAt   DateTime @default(now())

  consultation   Consultation @relation(fields: [consultationId], references: [id])
  patient        Patient      @relation(fields: [patientId], references: [id])

  @@index([patientId])
}

model LabOrderRequest {
  id             String   @id @default(uuid())
  consultationId String
  patientId      String
  testName       String
  clinicalNotes  String?
  priority       OrderPriority @default(ROUTINE)
  status         OrderStatus   @default(ORDERED)
  orderedBy      String
  orderedAt      DateTime @default(now())

  consultation   Consultation @relation(fields: [consultationId], references: [id])
  patient        Patient      @relation(fields: [patientId], references: [id])

  @@index([patientId])
}

model ImagingOrderRequest {
  id                 String   @id @default(uuid())
  consultationId     String
  patientId          String
  imagingType        String                      // e.g. "Chest X-Ray" — free text, no imaging-type catalog yet
  clinicalIndication String?
  priority           OrderPriority @default(ROUTINE)
  status             OrderStatus   @default(ORDERED)
  orderedBy          String
  orderedAt          DateTime @default(now())

  consultation       Consultation @relation(fields: [consultationId], references: [id])
  patient            Patient      @relation(fields: [patientId], references: [id])

  @@index([patientId])
}

enum OrderStatus {
  ORDERED
  CANCELLED
}

enum OrderPriority {
  ROUTINE
  URGENT
}
```

`status` here only distinguishes `ORDERED` from `CANCELLED` — the richer fulfillment lifecycle
(dispensed, sample collected, result verified, imaging completed) is each owning feature's own
concern, layered on top of these rows, not modeled here.

## 6. Consultation Lifecycle and Signing

`DRAFT` → `SIGNED` is one-way. A `SIGNED` consultation's structured fields
(`chiefComplaint`...`treatmentPlan`) become read-only at the service layer; any further
information is a new `ClinicalNote` referencing the same `consultationId`, timestamped and
attributed on its own, rather than a silent edit to the original record. This preserves an
accurate account of what was known and documented at the time of signing — matching how a signed
clinical note is treated as a point-in-time legal record everywhere else in healthcare
documentation.

## 7. Why / Where / Why Not

- **Why `Consultation` becomes immutable after `SIGNED`** — a signed clinical note is a
  point-in-time record; silently editable "signed" notes undermine the one property that makes
  signing meaningful. Addenda via `ClinicalNote` keep the correction visible and timestamped
  instead of rewriting history.
- **Why orders are created in EMR but fulfilled elsewhere** — matches the ordering/fulfillment
  split already established for every department in `01-application-flow.md`; a doctor's act of
  prescribing is a different moment, by a different role, than a pharmacist's act of dispensing.
- **Why `ClinicalNote` exists separately from `Consultation`** — not every clinical note is a full
  doctor encounter; forcing nursing notes or addenda through the same structured, sign-and-lock
  model as a consultation would either bloat `Consultation` with fields most notes don't need, or
  block a quick note behind an unnecessary full-encounter record.
- **Why `Vitals` ties to `Appointment`, not just `Patient`** — v1 covers outpatient visits, where a
  vitals reading is naturally tied to one visit; inpatient continuous monitoring is a different
  shape of data (frequent, ward-based, not visit-bounded) owned by Admission Management.
- **Why order tables carry only `ORDERED`/`CANCELLED`, not a full fulfillment lifecycle** — that
  lifecycle differs completely by order type (a prescription's states aren't a lab result's
  states), and belongs to whichever feature owns fulfillment, not to the ordering record itself.
- **Why `Consultation.appointmentId` is required, not nullable** — this document's scope is
  outpatient care, where every doctor encounter has a booked or walk-in visit behind it by
  definition (`07`). That's a deliberate scope boundary, not an oversight — see §8 for what it
  means for inpatient care.

## 8. Explicitly Out of Scope for v1

- **Inpatient/ward-round consultations.** `Consultation` requires an `Appointment` (§2), which
  only exists for outpatient visits (`07`). A ward round during an admission has no appointment to
  anchor to — extending `Consultation` (nullable `appointmentId` plus an alternative anchor) or
  building a parallel model for admission-based encounters is Admission Management's job, once
  that feature exists. Flagged explicitly so it isn't mistaken for something this document already
  handles.
- **Fulfillment of orders** — dispensing (`Prescription`), sample collection/result verification
  (`LabOrderRequest`), and imaging execution (`ImagingOrderRequest`) are the Pharmacy, Laboratory,
  and Radiology features' jobs respectively.
- **Voice dictation transcription** — stored as an `AUDIO` attachment only; speech-to-text is not
  designed here.
- **Inpatient/ward-based continuous vitals monitoring** — Admission Management's concern.
- **Lab test and imaging-type catalogs** — `testName`/`imagingType` are free text for now; a real
  catalog (with turnaround times, specimen requirements, etc.) is the Laboratory/Radiology
  features' job.
- **Amendment/addendum workflow details beyond "create a linked `ClinicalNote`"** — no formal
  addendum type or review process designed here.
