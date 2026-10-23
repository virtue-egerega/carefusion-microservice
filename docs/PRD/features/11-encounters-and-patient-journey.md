# Feature PRD — Encounters: Arrival, Queues, Consultation, Emergency & Admission

Status: Draft — Q1–Q3 decided, others pending (§20) · Last updated: 2026-10-19
Depends on: `04-departments.md` (`Department`, `Queue`), `05-access-control-clinical-scoping.md`
(`DutyProfile`, `PatientAssignment`, the effective-access rule), `06-patient-management.md`
(`Patient`, registration), `07-appointment-management.md` (`Appointment`),
`08-electronic-medical-records.md` (`Consultation`, `Vitals`, orders),
`10-billing-accounts-and-coverage.md` (`Charge`, `Coverage`, `BillingAccount`).
Revises: `07` (an `Appointment` becomes a booking that *creates* an encounter on check-in) and
`08` (`Consultation`, `Vitals` and orders anchor to an `Encounter`, not an `Appointment`). See §23.

Items marked **[Q n]** depend on an open decision in §20. The text describes the recommended
answer.

## 1. What Problem This Solves

Everything clinical and financial that happens to a patient during one visit (being triaged, seen,
tested, treated, admitted, billed, discharged) needs one record to belong to. Today the only
candidate is `Appointment` (`07`), and it fails in three ways:

- **Most visits aren't appointments.** Emergency arrivals, walk-ins sent straight to the lab, and
  every admitted patient have no booking. `08` §8 already admits that ward rounds have nowhere to
  attach.
- **A visit isn't one doctor in one room.** One outpatient visit passes through reception, the
  cashier, triage, a doctor, the lab, the pharmacy, and sometimes a second doctor. An emergency
  visit may become an admission. An admission lasts weeks and spans ward transfers.
- **Queue membership isn't recorded anywhere.** `01-application-flow.md` makes queues the backbone
  of every flow, and `05` §7 grants clinical access to "patient P′, currently in queue Q". But no
  model holds "this patient is waiting in this queue", so neither of them can actually work.

This document introduces three concepts and re-anchors existing ones onto them:

| Concept | Answers | § |
|---|---|---|
| **`Encounter`** | "This patient's visit": arrival to discharge, of a given class (outpatient, emergency, inpatient, service-only) | 4 |
| **`QueueEntry`** | "This patient is waiting at / being served by this station right now", with priority, calling and timing | 5 |
| **`Admission`, `Ward`, `Bed`** | The inpatient stay: request, bed, transfers, discharge | 13 |

Consultation, vitals, triage, orders and charges all attach to the `Encounter`.

## 2. Vocabulary

| Term | Meaning here |
|---|---|
| **Encounter** | One continuous episode of care at one branch. "Visit" in everyday language. Outpatient encounters usually last hours; inpatient encounters last days or weeks. An emergency visit that ends in admission is **one** encounter. |
| **Encounter type** | Whether the patient was admitted: `OUTPATIENT` or `INPATIENT`. Not the kind of visit: *GOPD* or *Eye* is the clinic (`clinicId`), *emergency* the department, and how they came is the **visit type** (`visitType`: walk-in, referral, ambulance…). |
| **Clinic** | What a patient comes to see: "what kind of doctor are you seeing today?" (GOPD, Eye Clinic, Antenatal Clinic). Run by a department, but not every department runs one. Reception checks patients into clinics, never departments (§3.3). |
| **Nursing station** | A clinic's first station (`<DEPT>_TRIAGE`, e.g. "GOPD Nursing Station"): nurses take vitals and triage before the doctor. Several clinics can share one. The Emergency department's equivalent is its Triage Queue. |
| **Appointment** | A booking for a future outpatient encounter (`07`). It does nothing clinically until check-in creates the encounter. |
| **Queue / task** | A queue is a **staff task list**, not a physical line. A queue entry is one station's task for the patient. A patient can be on several lists at once (lab and pharmacy; on the ward, the medication round and the ward round). The ticket number is what gets called aloud. |
| **Consultation** | A clinician's structured, signed note within an encounter. An encounter can have several. |
| **Disposition** | How an encounter ended clinically: home, admitted, transferred, left before being seen, died… |
| **Closed** | No station has a task for the patient any more: the last task was completed with nowhere next, or cancelled (§14). No more charges can post. |

## 3. Arrival and Identification

### 3.1 Every way a patient arrives

| Arrival mode | Typical path | Department | Type at opening |
|---|---|---|---|
| `WALK_IN` | Reception → clinic's nursing station → doctor | The clinic's | `OUTPATIENT` |
| `APPOINTMENT` | Check-in of an existing `Appointment` → nursing station → doctor | The booked clinic's | `OUTPATIENT` |
| `REFERRAL_IN` | From another facility with a letter. Checked in like a walk-in; the **nursing station** records the referral at triage (§8) | A clinic's, or Emergency | `OUTPATIENT` |
| `SELF_PRESENTED_EMERGENCY` | Walks or is carried into the emergency department | Emergency | `OUTPATIENT` |
| `AMBULANCE` | Brought by ambulance | Emergency | `OUTPATIENT` |
| `POLICE` | Brought by police (assault, accident, custody): medico-legal by default | Emergency | `OUTPATIENT` |
| `TRANSFER_IN` | Inter-facility transfer, usually straight to a ward | The ward's department (or Emergency first) | `INPATIENT` (or `OUTPATIENT` via Emergency) |
| `SERVICE_ONLY` | Comes only for a lab test, scan or pharmacy purchase, with no consultation. Standalone Lab and Pharmacy businesses (`01` §4–5); hospital reception sends patients to clinics, not service departments (§16) | Laboratory / Radiology / Pharmacy | `OUTPATIENT` |
| `BIRTH` | Born in the hospital (newborn registration, `06` §4) | The mother's | `INPATIENT` (linked to the mother's) |

**Emergency is a department, not an encounter type.** An emergency visit is an `OUTPATIENT`
encounter in the Emergency department. If the patient is sent home it stays `OUTPATIENT`; if
they're admitted, the same encounter becomes `INPATIENT` (§13.4). Observation in the emergency
department, even overnight, is not admission. Emergency-specific rules (no payment gate, formal
triage, quick registration, medico-legal handling) key off the Emergency department and its queues,
never off the encounter type (§12.2).

### 3.2 Finding or creating the patient

1. **NFC card tap** (`Patient.nfcId`), or a search (`06` §3). Search comes before create, always.
2. **Found:** confirm identity, offer a contact-details update, open the encounter.
3. **Not found, outpatient:** full registration (`06` §4), then open the encounter.
4. **Not found, emergency: quick registration.** Name (or "Unknown"), sex, estimated age and
   arrival mode only. Treatment never waits on paperwork. The rest is completed later by updating
   the same record.
5. **Unidentified patients** (unconscious, no ID): registered as `Unknown Male ~30y` with
   `Patient.isUnidentified = true` (a new field on `06`'s `Patient`) and a temporary identifier
   printed on a wristband. When identified, either the record is updated or, if it turns out the
   person was already registered, the two records are merged. **[Q 9]**

### 3.3 Check-in: "what kind of doctor are you seeing today?"

Reception asks the patient which doctor they've come to see, and the patient answers in their own
words: "a general doctor", "eye doctor", "antenatal". Reception picks the matching **clinic**
(`GET /clinics`). Departments never appear at reception: Pharmacy, Laboratory, Radiology and
Accounts run no clinics, and patients reach them only through orders and routing. In a hospital
you see a doctor first. Walking straight into a specialist clinic is allowed.

```prisma
model Clinic {
  id                  String  @id @default(uuid())
  systemKey           String  @unique   // "GOPD", "OPHTHALMOLOGY", "ANTENATAL", "DIABETES"…
  name                String            // what reception picks: "Eye Clinic"
  departmentId        String            // who runs it
  triageQueueId       String            // the nursing station patients wait at first
  consultationQueueId String            // the doctors' task list
  isActive            Boolean @default(true)
}
```

Clinics are system-defined like queues (`CLINIC_CATALOG` in `departments.catalog.ts`) and seeded
with them; hospitals may rename or deactivate one. Every department built with the standard clinic
stations runs a main clinic named after its doctors' queue (Eye Clinic, Paediatric Clinic…), plus
GOPD and the specialty clinics that share a nursing station (Diabetes and Hypertension → Medical
Nursing Station; Antenatal and Postnatal → O&G Nursing Station).

**Check-in** (`POST /encounters`) records, in one transaction:
- the encounter, at the clinic (`clinicId`; `departmentId` = the clinic's department), with
  `visitType = WALK_IN`, the age snapshot, and the coverage (by default the
  patient's highest-priority active coverage, or self-pay; overriding needs `coverage.select`)
- the patient's previous open encounter at this branch, closed (below)
- the consultation fee (§10.4), charged straight to the account, once the account can take it (§6.2).
  No billing task is created: the visit doesn't go to the Cashier list
- a task on each list reception chose (`sendTo`), as `AWAITING_SERVICE` so the nurse can attend to
  the patient at once (§6.2). The default is the nursing station. Anything
  else must be on reception's send lists (§5.7). Choosing billing as well doesn't put the patient
  on it twice. Being on both lists at once is normal: the patient pays while the nurse takes their
  vitals.

**Reception records no clinical details.** The reason for the visit is recorded at the nursing
station during triage (§8): the nurse's presenting complaint becomes the encounter's
`reasonForVisit`. Referrals are recorded when the encounter starts (designed later).

**No doctor is chosen at check-in, or anywhere in the system.** Reception records clinics and
queues, never a doctor. A patient who wants a particular doctor sorts it out where the doctors' list
is, offline; the system doesn't need to know who they wanted. It records only **who they eventually
saw**: the doctor who starts or completes their task on the doctors' list (`servedBy`). Any doctor
working that list (through their duty profiles, whatever their own department) can take any patient
on it.

**Nobody is held at check-in.** The account is funded before the encounter starts (§6.2), so every
task the visit starts with, and the doctors' task after vitals, is ready to be served.

**A new encounter closes the old one.** A patient has at most one open encounter per branch. Seeing
a doctor they already saw in this visit isn't a new encounter, and several consultations at several
clinics can happen within one encounter (consultations are designed separately). So starting a new
encounter means the previous visit is over:
- its unfinished tasks are **cancelled** with the reason "Closed: new encounter ENC-26-00490
  started";
- it is **closed**, with the disposition `LEFT_BEFORE_COMPLETION` if a clinician had seen the
  patient (`firstSeenAt`), otherwise `LEFT_WITHOUT_BEING_SEEN`, and the same note.

**Except an admission.** An open `INPATIENT` encounter means the patient is in a bed. Starting a new
encounter is refused (`409`, code `PATIENT_ADMITTED`: "This patient is admitted. Discharge them
first."). An admission ends only by discharge (§13.8), never silently.

The old encounter is closed in the same transaction that opens the new one, so a refused check-in
(no funds, §6.2) leaves the old visit exactly as it was.

`GET /encounters/open?patientId=` shows the unfinished visit and its remaining tasks.

Registration (`06`) and check-in are separate acts, usually one after the other at the same desk.
Emergency arrivals don't go through clinic check-in: they're taken to the Emergency department's
Triage Queue (§12). Appointment check-in uses the booked clinic (`07`).

## 4. `Encounter`

```prisma
model Encounter {
  id                String          @id @default(uuid())
  organizationId    String                               // tenant scope without joining the branch
  encounterNumber   Int                                  // sequential per organisation (§4.0)
  code              String                               // "ENC-26-00476": what staff, receipts and payers quote (§4.0)
  patientId         String
  branchId          String
  encounterType     EncounterType   @default(OUTPATIENT)
  status            EncounterStatus @default(OPEN)
  visitType         VisitType                            // how the patient came (§3.1)
  departmentId      String                               // the clinic's department (or Emergency); the ward's department once admitted
  clinicId          String?                              // the clinic the patient came to see (§3.3); null for emergency arrivals
  appointmentId     String?         @unique              // when checked in from a booking (07)
  parentEncounterId String?                              // a newborn's encounter → the mother's delivery encounter (§4.2)
  followUpOfId      String?                              // the earlier encounter this one follows up (§15.3)
  attendingStaffId  String?                              // responsible clinician; consultant for inpatients
  reasonForVisit    String?                              // the chief complaint, recorded by the nurse at triage (§8)
  ageAtArrivalDays  Int?                                 // snapshot: age on the day the encounter opened (06 §2.7); null if DOB unknown
  ageGroup          AgeGroup?                            // snapshot: group under the cutoffs in force that day
  acuity            Acuity?                              // latest emergency triage acuity, for task-list ordering
  triagePriority    QueuePriority?                       // latest triage priority (§8.1), given to the encounter's tasks
  coverageId        String?                              // chosen at check-in (10 §5); null = self-pay
  referringFacility String?
  referringClinician String?
  isMedicoLegal     Boolean         @default(false)
  policeReportNumber String?
  arrivedAt         DateTime        @default(now())
  firstSeenAt       DateTime?                            // first clinician contact (door-to-doctor KPI)
  disposition       Disposition?
  dispositionAt     DateTime?
  dispositionBy     String?
  dispositionNote   String?
  dischargedAt      DateTime?                            // inpatients: physical discharge from the ward
  closedAt          DateTime?                            // the last task was completed or cancelled (§14)
  closedBy          String?
  closedAtQueueId   String?                              // the station that finished the last task
  cancelledReason   String?
  createdBy         String
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  patient           Patient         @relation(fields: [patientId], references: [id])
  branch            Branch          @relation(fields: [branchId], references: [id])
  department        Department      @relation(fields: [departmentId], references: [id])
  appointment       Appointment?    @relation(fields: [appointmentId], references: [id])
  parent            Encounter?      @relation("EncounterChain", fields: [parentEncounterId], references: [id])
  children          Encounter[]     @relation("EncounterChain")
  followUpOf        Encounter?      @relation("FollowUp", fields: [followUpOfId], references: [id])
  followUps         Encounter[]     @relation("FollowUp")
  coverage          Coverage?       @relation(fields: [coverageId], references: [id])
  queueEntries      QueueEntry[]
  triages           TriageAssessment[]
  vitals            Vitals[]
  consultations     Consultation[]
  admissions        Admission[]                          // at most one ADMITTED; earlier requests may be CANCELLED
  charges           Charge[]

  @@unique([organizationId, encounterNumber])
  @@unique([organizationId, code])
  @@index([patientId, arrivedAt])
  @@index([branchId, status, encounterType])
}

/// Whether the patient was admitted to a bed. Not the kind of visit:
/// the clinic is clinicId, how they came is visitType.
enum EncounterType {
  OUTPATIENT   // not admitted (clinic, emergency, service-only)
  INPATIENT    // admitted; set once, at bed assignment (§13.4), and never reverts
}

enum EncounterStatus {
  OPEN              // some station still has a task for the patient
  CLOSED            // the last task was completed with nowhere next, or cancelled (§14)
  CANCELLED         // opened in error; nothing clinical recorded
}

enum VisitType {
  WALK_IN
  APPOINTMENT
  REFERRAL_IN
  SELF_PRESENTED_EMERGENCY
  AMBULANCE
  POLICE
  TRANSFER_IN
  SERVICE_ONLY
  BIRTH
}

// Clinical levels, most urgent first. The colour a scale shows (SATS red/orange/yellow/green/blue)
// is the frontend's concern.
enum Acuity {
  IMMEDIATE         // treat now
  VERY_URGENT       // within 10 minutes
  URGENT            // within 60 minutes
  ROUTINE           // within 4 hours
  DEAD_ON_ARRIVAL
}

enum Disposition {
  DISCHARGED_HOME
  TRANSFERRED_OUT           // to another facility
  REFERRED_OUT              // sent elsewhere for care, not as an inpatient transfer
  LEFT_WITHOUT_BEING_SEEN   // left before a clinician saw them
  LEFT_BEFORE_COMPLETION    // seen, then left with tasks unfinished; recorded after following up (§14.2)
  LEFT_AGAINST_ADVICE       // discharged against medical advice (DAMA), documented
  ABSCONDED                 // left without notice after being seen / while admitted
  DIED
  BROUGHT_IN_DEAD
  SERVICE_COMPLETED         // service-only visits (visitType = SERVICE_ONLY)
}
```

There is no `ADMITTED` disposition. Admission doesn't end the encounter: it changes its type and
the encounter carries on (§13.4). "Emergency visits that ended in admission" are emergency
encounters with an `ADMITTED` `Admission`.

**Integrity rule** (migration SQL): one encounter per `(patientId, branchId)` with
`status = 'OPEN'` (§3.3).

All encounter enums are mirrored in `src/shared/enums/encounters/encounter.enums.ts` and served to
the frontend by `GET /enums` (`encounters` group); a spec keeps them identical to the schema.

**Age snapshot.** `ageAtArrivalDays` and `ageGroup` are computed from the patient's date of birth
and the organisation's cutoffs when the encounter opens, and never recalculated. Reports, billing
rules and clinical history therefore keep showing what applied at the time, even if a cutoff
changes or a date of birth is corrected later (`06` §2.7). Days, not years, because neonatal care
needs that precision. Both are null when the date of birth is unknown. They're computed by
`ageSnapshot()` (`src/patients/age-group.ts`), already built and tested, which encounter creation
calls.

### 4.0 Encounter code

Every encounter has a code people can read, say and print: `ENC-26-00476`. Staff quote it on the
phone and at the cashier; receipts, invoices, lab request forms and discharge summaries print it;
payers' claims and pre-authorisations reference the visit by it. A patient number identifies the
person, never the visit, and a UUID can't be read aloud.

- **`encounterNumber`** is one continuous sequence per organisation, never restarted. It's taken
  from `SequenceCounter` (scope `encounter:<organizationId>`) in the same transaction that creates
  the encounter, as ticket numbers are (§5.4): two check-ins never share a number, and a check-in
  that fails rolls its number back, so there are no gaps.
- **`code`** is `ENC-<yy>-<number, at least 5 digits>`, built once at creation and stored, so every
  list, receipt and search reads it without formatting. `yy` is the year the encounter opened, in
  Africa/Lagos time (the deployment default until organisations have a timezone setting). The year
  is a reading aid only: the number alone is unique.
- **One code for the whole visit.** Admission doesn't start a new encounter (§13.4), so an
  inpatient keeps their code from arrival to discharge.
- **Search.** Task lists find an encounter by its code, in any case, with or without the zero
  padding (`enc-26-476`). The search matches the number; the year is only a reading aid.
- **Existing encounters** are numbered by the migration, in `arrivedAt` order per organisation,
  and each organisation's counter is set to its highest number.

### 4.1 Lifecycle

```
check-in ──▶ OPEN ──last task completed (nowhere next) or cancelled──▶ CLOSED
OPEN ──opened in error, nothing recorded──▶ CANCELLED
```

**An encounter is open while any station still has a task for the patient.** Queues are staff
task lists (§5), and the encounter's tasks are its queue entries. When a station finishes its task
it either sends the patient on (a new task elsewhere) or lets them go. If it lets them go and no
other station still has a task for them, the encounter closes there: pharmacy after dispensing,
the cashier after payment, the lab after the sample, the doctor after the consultation, whichever
is last. Sent to lab and pharmacy, lab finishes first: the pharmacy task is still there, so the
encounter stays open until pharmacy finishes.

- **`firstSeenAt`** is set the first time any task of the encounter is started or completed. It's
  the door-to-clinician timestamp, and the only "has anyone seen them" state needed.
- **`disposition`** is the clinical outcome (died, referred out, left against advice, left before
  being seen…). Doctors record it where it matters; staff following up a patient who left record
  it when cancelling their last task (§14.2). It doesn't open or close anything.
- **Admission** is not a status change. `encounterType` goes `OUTPATIENT` → `INPATIENT` at bed
  assignment (§13.4), once. The admitted patient's **ward task** stays on the ward's list for the
  whole stay (§13.6), so the encounter stays open between medication rounds and ward rounds;
  physical discharge completes it.
- **Nothing closes on its own.** A patient who walks out leaves their tasks open. It's the
  hospital's duty to reach them and record what happened (§14.2).
- **`CANCELLED`** is only allowed while nothing clinical or financial is attached.

### 4.2 Linked encounters

What is **not** a new encounter:
- **Emergency → admission, clinic → admission:** the same encounter. It becomes `INPATIENT` at bed
  assignment (§13.4). Time in the emergency department is `arrivedAt` → `Admission.admittedAt`;
  boarding time is `Admission.requestedAt` → `admittedAt`. A payer that wants the emergency part
  and the stay claimed separately gets them split at `admittedAt`.
- **Inpatient → specialist clinic → back to ward:** a queue entry in the clinic's queue and a
  `Consultation(REFERRAL)`, within the inpatient encounter.
- **Inpatient → theatre → back to ward:** stays *within* the inpatient encounter. Theatre is a
  queue and a procedure record, not a new encounter (the Theatre PRD).

What **is** a new encounter, linked:
- **Mother → newborn:** the baby's `INPATIENT` encounter has `parentEncounterId` = the mother's
  delivery encounter. The two are linked, but the baby's care is billed and recorded separately.
- **Follow-up:** `followUpOfId` points at the encounter being followed up. This drives the
  follow-up fee window (§15.3). Coming back to have a result looked at by a doctor is a follow-up
  encounter when the original has closed (§14).

## 5. `QueueEntry`: a station's task for the patient

**Queues are staff task lists, not physical lines.** A queue entry is one station's task for the
patient: "take this patient's vitals", "see this patient", "dispense this prescription", "give the
8pm drugs". A patient can be on several lists at once (lab and pharmacy; on a ward, the medication
round and the ward round), and the encounter stays open while any of them still has a task (§4.1).

### 5.1 Model

```prisma
model QueueEntry {
  id              String           @id @default(uuid())
  encounterId     String
  patientId       String                              // denormalised for worklist queries
  queueId         String
  branchId        String
  ticketNumber    Int                                 // per queue, per branch, per day (§5.4)
  priority        QueuePriority    @default(ROUTINE)
  priorityReason  String?                             // why it was raised (audited)
  status          QueueEntryStatus @default(WAITING)
  holdReason      HoldReason?                         // when status = HELD
  roomId          String?
  sourceType      String?                             // what put them here or holds them: "CONSULTATION_FEE", "LAB_ORDER"…
  sourceId        String?
  fromEntryId     String?                             // the entry that routed the patient here
  enteredAt       DateTime         @default(now())
  readyAt         DateTime         @default(now())    // when it became workable (after a hold); orders the list
  calledAt        DateTime?
  calledBy        String?
  callCount       Int              @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  servedBy        String?
  outcomeNote     String?
  createdBy       String

  encounter       Encounter        @relation(fields: [encounterId], references: [id])
  queue           Queue            @relation(fields: [queueId], references: [id])
  fromEntry       QueueEntry?      @relation("QueueRouting", fields: [fromEntryId], references: [id])
  routedTo        QueueEntry[]     @relation("QueueRouting")

  @@index([queueId, status, priority, readyAt])
  @@index([encounterId, status])
}

enum QueuePriority {
  EMERGENCY        // jumps everything
  URGENT
  ROUTINE
}

enum QueueEntryStatus {
  WAITING          // on the list, not yet cleared to be served (e.g. an order waiting on payment)
  HELD             // in the queue but not callable yet (holdReason)
  AWAITING_SERVICE // cleared to be served, ahead of WAITING: a funded visit's tasks (§6.2), or paid after an interruption
  CALLED           // the patient was called for this task
  IN_SERVICE       // being attended to
  COMPLETED
  NO_SHOW          // reserved; not set automatically (§5.5)
  TRANSFERRED      // moved to another queue without being served here
  CANCELLED        // order cancelled / encounter ended
}

enum HoldReason {
  AWAITING_PAYMENT     // service interrupted to pay (an order priced at the station, §6)
  AWAITING_PREAUTH     // payer pre-authorisation pending (10 §6.3)
  AWAITING_RESULT      // e.g. doctor review waiting on a lab result
}
```

**Database integrity rule** (in migration SQL, since Prisma can't express it): at most one
*active* task (`WAITING`, `HELD`, `AWAITING_SERVICE`, `CALLED`, `IN_SERVICE`) per encounter per queue. There is **no**
"one task in service at a time" rule: a nurse can give drugs while a doctor does the ward round.

### 5.2 Ordering

A queue's callable list is the `WAITING` entries ordered by **priority** (`EMERGENCY` > `URGENT` >
`ROUTINE`), then **acuity** for emergency queues (`IMMEDIATE` > `VERY_URGENT` > `URGENT` > `ROUTINE`),
then **`readyAt`**. `readyAt` is reset when a hold is released, so time spent unpaid doesn't count
as time waiting. **[Q 4]** A task whose service was interrupted to pay (pharmacy or lab priced it,
then sent the patient to billing: `IN_SERVICE` → `HELD`/`AWAITING_PAYMENT`) comes back as
`AWAITING_SERVICE` when paid, keeps its `readyAt`, and is served before `WAITING` entries of the same
priority; a task held before it ever started goes back to `WAITING` at the back. A funded visit's
tasks start as `AWAITING_SERVICE` (§6.2).
Booked appointments are ordered by their slot time, plus a configurable
grace window; walk-ins fill the gaps. **[Q 10]**

Raising priority requires `queue.manage` and a `priorityReason`, and is audited.

### 5.3 Working a task

Built as `POST /queue-entries/:id/{call,start,complete,cancel}`. Only tasks on queues in the
caller's duty profiles, at their branch (`05` §7); anything else is a 404. Each move is an update
conditioned on the task's current status, so two staff acting at once can't both succeed: the
second gets "changed by someone else; refresh".

| Action | From | Effect |
|---|---|---|
| **call** (`queue.call`) | `WAITING`, `CALLED` | `CALLED`, `calledAt`, `calledBy`, `callCount + 1`. Calling again is allowed. |
| **start** (`queue.call`) | `WAITING`, `CALLED` | `IN_SERVICE`, `startedAt`, `servedBy`; sets `Encounter.firstSeenAt` if unset |
| **complete** (`queue.call`) | `WAITING`, `CALLED`, `IN_SERVICE` | `COMPLETED`; then send the patient on (`nextQueueId`) or let them go (§5.7) |
| **cancel** (`queue.manage`) | any active, including `HELD` | `CANCELLED` with a reason (§14.2) |

A `HELD` task can't be called, started or completed: the patient is waiting for payment.
Tasks aren't assigned to a person: anyone working the list can take any task on it. Who did the
work is recorded as `servedBy` when the task is started or completed.

### 5.4 Ticket numbers

`ticketNumber` is a daily sequence **per queue per branch** (queues are shared across branches),
starting at 1 each day (UTC). It's what gets announced or shown on a display board next to the
queue's name, so patients never hear their name called across a waiting room. Tickets come from
`SequenceCounter(scope, lastNumber)` rows, incremented in one
`INSERT … ON CONFLICT … RETURNING` statement inside the transaction that creates the task. A letter prefix
(`OPD-023`) can be added later from the catalog if display boards need it.

### 5.5 Patients who don't respond

Each call increments `callCount`, so the list shows who has been called several times without
coming. Nothing is marked no-show or closed automatically: a patient who left still has an
unfinished visit, and staff follow it up (§14.2).

### 5.6 Parallel tasks

One consultation can send the patient to the lab *and* the pharmacy (`01` §2). Each station gets
its own task and works it independently; there's no "with another station" hold, because these are
task lists, not lines the patient stands in. When the lab finishes first and lets the patient go,
the pharmacy task is still there, so the encounter stays open until pharmacy finishes (§4.1).

Object worklists (sample processing, result verification, image reporting) are **not** queue
entries. Those are records waiting in their department's worklist, and the patient isn't
involved (`04`, `01` §2).

### 5.7 Routing: where next?

When a station completes its task, it chooses where the patient goes next (`nextQueueId`), or
nowhere. Pharmacy, for example, asks "are you seeing the doctor again?" and, if not, lets the
patient go. Defaults the frontend should suggest:

| From | Default next |
|---|---|
| Check-in | The clinic's nursing station (§3.3) |
| Nursing station | The clinic's doctors' queue |
| Doctor | Created by orders: lab, imaging, pharmacy, procedure room… Otherwise nowhere |
| Pharmacy, lab, cashier… | Back to the doctor if they're seeing them again, otherwise nowhere |

**Sending a patient without working a task.** Any staff member can put a patient on another
station's list: `POST /encounters/:id/tasks`, or `sendTo` at check-in. Every station sends patients
on, so this needs no permission key (the old `queue.send` is retired); the control is the queues on
the caller's duty profiles' **send lists**:

```prisma
model DutyProfileSendQueue {   // queues this profile may put patients on
  dutyProfileId String
  queueId       String
  @@unique([dutyProfileId, queueId])
}
```

Separate from `DutyProfileQueue` on purpose: that one grants access to a queue's list and its
patients (`05` §7); sending a patient to billing must not let reception open billing's list. The
seeded Receptionist profile can send to billing (Cashier) and every clinic's nursing station;
`GET /queues/sendable` lists the caller's targets, and `POST/DELETE /duty-profiles/:id/send-queues`
manages them. Send lists are read when a patient is sent, so changing them needs no re-login.

Sending on creates the next task with `fromEntryId` set and a new ticket. Letting the patient go
closes the encounter if no other station still has a task for them (§14). Orders will create their own tasks
(`sourceType`/`sourceId` = the order), so a lab order puts the patient on Sample Collection's list
automatically.

### 5.8 Access

A `QueueEntry` in queue Q is the fact `05` §7 depends on: "patient P′ is currently in queue Q".
Staff whose duty profiles include Q can open that patient's record and act within their
permissions. The entry stays the access basis until the encounter is closed. After that, access
needs a `PatientAssignment` or a new encounter. **[Q 12]**

## 6. Payment: Funding at Check-in and Billing Tasks

**Billing is a station like any other.** "Collect what this patient owes" is a task on the Cashier
list. It runs in parallel with the patient's other tasks, and because it's a task, an unpaid bill
keeps the visit open. Billing is often the last station, and closes the encounter like any other
(§14.1).

### 6.1 Owing puts the patient on the Cashier list

**Posting a charge the patient owes puts them on the Cashier list** at the branch it was posted
(`ChargesService.post`), so nobody has to send them. The one exception is the consultation fee at
check-in, which is charged to the account with no billing task (§6.2); orders (lab, pharmacy and
everything else) send the patient to Accounts to settle. A charge paid at once from credit on the
account, or one they owe nothing for (covered, free), doesn't. The patient is on the list **once**:

| Charge | Patient already on the Cashier list | Result |
|---|---|---|
| Outside a visit (registration, NFC card) | no | new task, `sourceType = REGISTRATION_BILL`, no encounter |
| Outside a visit | yes | kept: that task collects it |
| In a visit (consultation fee; later lab, pharmacy…) | for this visit | kept |
| In a visit | for their registration fees | that task becomes the visit's (`ENCOUNTER_BILL`): one ticket, one payment |
| In a visit | no | new task, `sourceType = ENCOUNTER_BILL` |

Registration returns the cashier's ticket (`billingTask`), as does starting an encounter (in
`tasks`). A billing task without an encounter can be completed or cancelled like any other, but
not sent on: that needs an encounter. **Database integrity rule:** at most one active
registration billing task per patient per queue (partial unique index; encounter tasks are
covered by §5.1's).

**Paying completes the billing task.** When a deposit leaves nothing unpaid of the patient's own
share of the task's visit, nor of any fee outside a visit, the billing task completes
automatically (`QueueHoldsService.settle`, run inside the deposit). If that was the visit's last task, the encounter closes at billing. The cashier can
also complete it by hand (a payment arrangement, an insured visit with nothing to collect).

### 6.2 Funding at check-in

**The account is funded before the encounter starts.** The encounter then goes straight to work:
its tasks start as `AWAITING_SERVICE`, so the nurse attends to the patient at once, and the doctors'
task created after vitals is `AWAITING_SERVICE` too. Nothing in the visit waits for the consultation
fee, and the visit never goes to the Cashier list for it.

The consultation fee is **charged straight to the account** at check-in. Whether the encounter may
start depends on two organisation settings:

| Setting | Values | Effect |
|---|---|---|
| `consultationPayment` | `BEFORE` (default) / `AFTER` | `BEFORE`: the account must already hold enough to pay the fee: fund the account first, then start the encounter. `AFTER`: the fee may go on the account as debt, within `maxUnpaidBeforeHold`. |
| `maxUnpaidBeforeHold` | amount, default 0 | `AFTER` only: how far the account may owe once the fee is charged. |

**The rule** (after charging the fee, against the account's whole `balance`, so older debts count):

| Policy | Starts when | Example: fee ₦5,000 |
|---|---|---|
| `BEFORE` | `balance − fee ≥ 0` | balance ₦5,000 → starts, the credit pays the fee; ₦4,000 → refused, deposit ₦1,000 |
| `AFTER` | `balance − fee ≥ −maxUnpaidBeforeHold` | threshold ₦10,000, balance −₦3,000 → −₦8,000, starts; balance −₦6,000 → −₦11,000, refused, deposit ₦1,000 |

Refused: `409` with code `INSUFFICIENT_FUNDS` and how much to deposit ("Deposit at least ₦1,000.00 to
start this visit"). No encounter is created, no encounter number is used, and the patient's old
encounter is left as it was. The check runs inside the check-in transaction, with the account
locked, so two check-ins can't spend the same credit.

**`creditLimit` doesn't apply here.** `BEFORE` means the money is on the account.

**The check applies only when a fee is charged to the patient's own account:** self-pay visits
(no coverage, or `selfPay`). Insured visits aren't charged at check-in until payer allocation
(`13` Phase 2), so they start freely. Emergency arrivals don't go through clinic check-in (§12):
stabilise first, bill after. Nigerian law requires it for gunshot victims (Compulsory Treatment and
Care for Victims of Gunshot Act, 2017), and it's sound practice for every emergency.

**Holds remain for orders.** When lab, imaging or dispensing price an order at the station and the
patient must pay first, the task is held (`HELD / AWAITING_PAYMENT`) and the patient goes to
Accounts; a deposit releases it (§5.2). **Not built yet:** order holds,
pre-authorisation holds (`AWAITING_PREAUTH`), and the manual override (`queue.payment.override`).

## 7. Outpatient Flow, End to End

| # | Station (task list) | Who | Data written |
|---|---|---|---|
| 0 | Cashier (often first) | Cashier | Patient funds their account (`10` §7), frequently before registration |
| 1 | Reception | Receptionist | Patient found/registered (`06`); "what kind of doctor are you seeing today?" → clinic (never a doctor); `Encounter(OUTPATIENT, OPEN)` at the clinic; coverage; consultation fee posted and paid from credit if there is any; tasks on billing, the clinic's nursing station, or both (§3.3) |
| 2 | Billing (in parallel) | Cashier | Deposit; the billing task completes when the visit is paid, and any held doctor's task is released (§6) |
| 3 | Nursing station (in parallel) | Nurse | `TriageAssessment` (basic, with referral details if referred) + `Vitals`; `firstSeenAt`; send to the clinic's doctors' list, where the task waits for payment if the hospital collects first |
| 4 | Doctor | Doctor | `Consultation` (DRAFT → SIGNED), `Diagnosis`, orders; each order creates `Charge`s and a task on its service's list |
| 5a | Sample Collection / Imaging | Lab / radiology | Fulfilment (their PRDs); results go to the doctor's results-ready worklist |
| 5b | Pharmacy (Dispensing) | Pharmacist | Dispensing (Pharmacy PRD); "are you seeing the doctor again?" |
| 5c | Procedure room | Nurse | Injection / dressing recorded |
| 6 | Doctor (review) | Doctor | Optional same-day result review: a new task on the doctors' list, assigned to the same doctor; a second `Consultation(RESULT_REVIEW)` |
| 7 | Whichever station is last | That station | Completes its task with nowhere next. No other task left → encounter `CLOSED` there, even if results are pending (§14) |

Every clinic (dental, eye, ENT, antenatal, physiotherapy…) uses exactly this chain with its own
nursing station, doctors' queue, consultation template and fees (`01` §3.2).

## 8. Triage

Triage is its own top-level module (`src/triage/`), like consultations: the nursing station's
assessment of an encounter, and the vital signs taken during it. Permissions: **`triage.view`**
(read) and **`triage.create`** (record, re-triage, correct and remove readings), for the doctors,
nurses and pharmacists who triage. `triage.create` replaces the old `vitals.record`, whose holders
carry over.

**Outpatient triage** (the clinic's nursing station) is built now. **Emergency triage** with a formal
acuity scale (SATS by default, `Encounter.acuity`) comes later **[Q 8]**. **Referrals** are recorded
when the encounter starts, not at triage; that's designed later.

### 8.1 The assessment

One current assessment per encounter. Re-triaging, or correcting it, records a **new version** that
replaces the previous one; the old version stays on record, never edited.

```prisma
model TriageAssessment {
  id                  String          @id @default(uuid())
  encounterId         String
  presentingComplaint String                      // copied to Encounter.reasonForVisit
  onset               String?                     // free text: "2 days ago"
  painLocation        String?
  avpu                Avpu                        // level of consciousness
  dangerSigns         DangerSign[]                // none or more
  priority            QueuePriority               // the nurse's decision
  suggestedPriority   QueuePriority?              // what the protocol suggested, kept beside it
  replacesId          String?         @unique     // the version this one replaces; one replacement each
  changeReason        String?                     // why it was re-triaged or corrected
  triagedBy           String
  triagedAt           DateTime        @default(now())
}

enum Avpu       { ALERT VOICE PAIN UNRESPONSIVE }
enum DangerSign { UNABLE_TO_DRINK PERSISTENT_VOMITING CONVULSIONS LETHARGY SEVERE_DEHYDRATION DIFFICULTY_BREATHING }
```

**Priority, not acuity.** Outpatient triage sets **task priority** (`EMERGENCY` / `URGENT` /
`ROUTINE`, §5.2), which the doctors' list already sorts by. The latest assessment's priority is
copied to `Encounter.triagePriority`, applied to the encounter's active tasks, and given to every
task created for the encounter after it, so the doctors' list orders by it without anyone raising
priority by hand.

**The suggested priority** is worked out by the frontend from the hospital's triage protocol and sent
as `suggestedPriority`, beside the nurse's `priority`; the record shows both. The protocol (which
vitals count as abnormal, by age group) is still to be confirmed by the medical lead, so the backend
doesn't compute it yet. When it's confirmed, the rule and the age-based normal ranges move to the
backend and are served to the frontend, so they're defined once.

Recording an assessment doesn't move the patient: sending them on to the doctors' list is still
completing the triage task (§5.3), which creates the doctors' task `AWAITING_SERVICE` (§6.2).

### 8.2 Rules

- The encounter must be the caller's organisation's and `OPEN`.
- A new version must replace the current one (the client sends nothing: the backend links it). Two
  nurses re-triaging at once can't both replace the same version (`replacesId` is unique).

## 9. Vitals (re-anchored from `08` §3)

A nurse can take vitals several times in an encounter; each reading is one row, tied to the
encounter, so the same model serves outpatient triage, emergency observations and ward rounds.

```prisma
model Vitals {
  id              String        @id @default(uuid())
  encounterId     String
  context         VitalsContext @default(TRIAGE)
  takenAt         DateTime                       // when it was taken, not typed; required
  temperature     Decimal?      @db.Decimal(3, 1) // °C, 30–45
  pulse           Int?                            // bpm, 20–250
  respiratoryRate Int?                            // /min, 4–90
  systolic        Int?                            // mmHg, 40–260
  diastolic       Int?                            // mmHg, 20–160
  spo2            Int?                            // %, 50–100
  painScore       Int?                            // 0–10
  bloodGlucose    Decimal?      @db.Decimal(3, 1) // mmol/L, 1–35
  weight          Decimal?      @db.Decimal(5, 2) // kg, 0.3–350
  height          Decimal?      @db.Decimal(4, 1) // cm, 20–250
  notes           String?
  replacesId      String?       @unique          // a correction replaces the reading it corrects
  editReason      String?                        // required on a correction
  removedAt       DateTime?                      // removed readings stay on record, struck through
  removedBy       String?
  removeReason    String?
  recordedBy      String
  recordedAt      DateTime      @default(now())
}

enum VitalsContext { TRIAGE OBSERVATION WARD_ROUND PRE_OP POST_OP }
```

- **At least one vital**, and **blood pressure comes as a pair** (systolic and diastolic together,
  or neither).
- **The limits catch typos** (385 for 38.5), not abnormal values: an abnormal reading is recorded as
  taken. Units are fixed per field.
- **`takenAt`** is a full date and time, no earlier than the patient's arrival and not in the future.
- **Correcting a reading** saves the corrected reading as a new row replacing it, with `editReason`;
  the original stays on record. **Removing** sets `removedAt` / `removedBy` / `removeReason`; the
  reading stays visible, struck through. A replaced or removed reading can't be corrected again.
- The extra fields of the earlier design (GCS, MUAC, head circumference) are added when the forms
  need them.

**Inpatient observation charts** (frequency orders such as "4-hourly vitals", fluid balance,
neuro-observations) belong to the Nursing PRD. They write `Vitals(context = OBSERVATION)` rows
against the inpatient encounter.

### 9.1 Triage APIs

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/encounters/:id/triage` | POST | `triage.create` | Record the assessment, or re-triage (`changeReason`): a new version replacing the current one; `{ id, message }` |
| `/encounters/:id/triage` | GET | `triage.view` | The current assessment and its earlier versions, newest first |
| `/encounters/:id/vitals` | POST | `triage.create` | Record a reading; `{ id, message }` |
| `/encounters/:id/vitals` | GET | `triage.view` | `{ count, docs }` by `takenAt`, newest first; filters `context`, `from` / `to`, `includeRemoved` (default true), `includeReplaced` (default false); `limit` / `offset` |
| `/vitals/:id` | PATCH | `triage.create` | Correct a reading: the changed fields plus `editReason`; `{ id, message }` (the new reading) |
| `/vitals/:id/remove` | POST | `triage.create` | `{ reason }`; `{ message }` |

## 10. Consultation (re-anchored from `08` §2)

### 10.1 Changes to `08`

- `Consultation.appointmentId @unique` becomes **`encounterId`** (not unique) plus an optional
  `queueEntryId`. An encounter can have several consultations: the triage doctor and then a
  specialist, an emergency doctor and then a surgical review, every ward round of an admission.
- New field **`consultationType`**:

```prisma
enum ConsultationType {
  INITIAL           // first consultation of the encounter
  FOLLOW_UP         // in a follow-up encounter (§15.3)
  RESULT_REVIEW     // reviewing results within the same encounter
  REFERRAL          // seen on internal referral (§15.1)
  EMERGENCY         // emergency assessment
  WARD_ROUND        // inpatient daily review (§13.6)
  ADMISSION_CLERKING // full admission history & examination
  PRE_OPERATIVE
}
```

- Draft → signed → immutable, with addenda as `ClinicalNote`s: unchanged from `08` §6.
- **`Diagnosis` gains `certainty`** (`PROVISIONAL`, `DIFFERENTIAL`, `CONFIRMED`, `RULED_OUT`). An
  emergency doctor's working diagnosis is provisional, and the ward confirms or rules it out
  later. Without this, a provisional diagnosis is indistinguishable from a confirmed one in the
  patient's history.

### 10.2 Who can consult

Doctors (and nurse practitioners where the hospital permits) with `consultation.create` in the
queue the patient is in (`05` §7). Signing requires `consultation.sign`. A trainee's (house
officer's) consultation may need co-signature by a senior. **[Q 13]**

### 10.3 Templates

Specialties need different structured fields: antenatal (gestational age, fundal height, fetal
heart rate), dental (tooth chart), ophthalmology (visual acuity). v1 keeps `08`'s general
structure for every specialty. Specialty templates are flagged as a follow-up feature. Until then,
specialty-specific findings go in the free-text sections. **[Q 15]**

### 10.4 Consultation fee

The fee posts **at check-in** (`Charge.sourceType = CONSULTATION_FEE`, `sourceId` = the encounter):
the billable item reception chose (`billableItemId`; `GET /billables/clinics/:clinicId/consultation`
lists the clinic's items first, `12` §4.4), at its current self-pay price (`13` §4). It's charged
straight to the account once the account can take it (§6.2); it creates no billing task. Insured
visits aren't charged at check-in until payer allocation (`13` Phase 2).

One encounter can hold several consultations at several clinics, each charged when it starts, and
sometimes one fee covers the whole visit; that is designed with consultations.

If the patient leaves before being seen, the consultation fee charge must be reversed. That's a
charge void, and `10` §8 requires an approved request for every void. **[Q 6]**

## 11. Orders (re-anchored from `08` §5)

### 11.1 Changes to `08`

- `consultationId` stays (most orders come from a consultation) but becomes **optional**, and
  **`encounterId`** is added and required. Nurses act on standing orders, the emergency department
  orders before a full consultation is written, and ward orders come from rounds.
- `OrderPriority` gains **`STAT`** (immediate). `STAT` orders create `EMERGENCY`-priority queue
  entries and jump object worklists too.

### 11.2 What an order triggers

| Order | Queue entry created | Object worklist (owning PRD) |
|---|---|---|
| Lab request | Sample Collection (patient-facing) | Processing → verification → results ready (Laboratory) |
| Imaging request | The modality's queue (X-Ray, Ultrasound, CT) | Reporting → results ready (Radiology) |
| Prescription | Dispensing (outpatient). Inpatient: ward medication round (Nursing) | — |
| Procedure / injection | Procedure room (Nursing queue) | — |
| Admission | — (Admission request, §13.2) | Bed management worklist |
| Theatre | — | Theatre booking (Theatre PRD) |

### 11.3 When an order is charged **[Q 6]**

The order is charged **when it's placed**, not when it's fulfilled. The cashier has to see the
bill before the patient pays, and a gated service queue (§6) needs a concrete charge to check.

Cancellation is the hard part. An order cancelled before fulfilment has to reverse its charge.
Recommended rule:
- **Nothing paid yet, nothing delivered:** cancelling the order voids its charge **automatically**,
  attributed to the cancelling clinician and with the order's cancellation reason. No money has
  moved and no service was delivered, so there's nothing for a second person to protect. This
  needs a narrow exception to `10` D12 (every void needs an approved request).
- **Anything paid:** the void goes through an approved `CHARGE_VOID` request, and the payment
  becomes unapplied credit or a `REFUND` request, exactly as in `10` §8.

## 12. Emergency Flow

An emergency visit is an `OUTPATIENT` encounter in the Emergency department (§3.1). If the patient
is admitted, the same encounter becomes `INPATIENT` (§13.4).

### 12.1 Path

| # | Station (seeded queues, `04` §3) | Data written |
|---|---|---|
| 1 | Arrival: triage desk or resuscitation bay directly (not clinic check-in) | Quick registration if needed (§3.2); `Encounter(OUTPATIENT)` in Emergency, no clinic; `visitType`; medico-legal flag |
| 2 | **Triage Queue** | `TriageAssessment(SATS)` with acuity; `IMMEDIATE` goes straight to Resuscitation |
| 3 | **Resuscitation Queue** (`IMMEDIATE`) / **Emergency Queue** (others) | `Consultation(EMERGENCY)`, STAT orders, procedures, vitals |
| 4 | **Observation Queue** | Held for monitoring: repeated vitals, response to treatment, waiting for results |
| 5 | Disposition or admission | Home / transfer out / DAMA / died / absconded; or admit (§13): the encounter continues as `INPATIENT` |
| 6 | Cashier | After stabilisation, never before (§6) |

### 12.2 Emergency-specific rules

These apply because of the **department** (Emergency) and its queues, not the encounter type.

- **No payment gate**, anywhere in the emergency department (§6).
- **Treatment before identity:** quick registration (§3.2). Unidentified patients are allowed.
- **Medico-legal cases** (`isMedicoLegal`: assault, road traffic accident, gunshot, police
  custody): record `policeReportNumber`. Reports, photographs and certificates for the police are
  generated documents (out of scope, §22). Access to these records may be restricted. **[Q 12]**
- **Brought in dead:** an encounter in Emergency with `disposition = BROUGHT_IN_DEAD` and the time
  confirmed. No queue path. `Patient.status = DECEASED` (`06`).
- **Boarding:** a patient admitted but waiting for a bed stays `OUTPATIENT` with an Observation
  task until a bed is assigned (§13.4). Boarding time (`Admission.requestedAt` → `admittedAt`) is
  a reportable KPI.
- **Mass-casualty incidents** (rapid bulk registration, incident tagging): out of scope (§22).

## 13. Inpatient: Admission, Stay and Discharge

### 13.1 Wards and beds

```prisma
model Ward {
  id            String       @id @default(uuid())
  branchId      String
  departmentId  String                         // owning clinical department (04)
  name          String                         // "Female Surgical Ward"
  code          String                         // "FSW"
  wardType      WardType
  genderPolicy  GenderPolicy @default(MIXED)
  isActive      Boolean      @default(true)

  beds          Bed[]
  @@unique([branchId, code])
}

model Bed {
  id         String     @id @default(uuid())
  wardId     String
  code       String                            // "FSW-07"
  bedClass   BedClass                          // drives the daily rate (§13.7)
  status     BedStatus  @default(AVAILABLE)
  isActive   Boolean    @default(true)

  ward        Ward      @relation(fields: [wardId], references: [id])
  assignments BedAssignment[]
  @@unique([wardId, code])
}

model BedAssignment {
  id           String    @id @default(uuid())
  encounterId  String                          // the INPATIENT encounter
  bedId        String
  startedAt    DateTime  @default(now())
  endedAt      DateTime?
  reason       BedMoveReason
  assignedBy   String

  @@index([encounterId])
  @@index([bedId, endedAt])
}

enum WardType { GENERAL MATERNITY LABOUR PAEDIATRIC NEONATAL ICU HDU ISOLATION PSYCHIATRIC PRIVATE }
enum GenderPolicy { MALE FEMALE MIXED }
enum BedClass { GENERAL SEMI_PRIVATE PRIVATE ICU HDU NEONATAL_COT }
enum BedStatus { AVAILABLE RESERVED OCCUPIED CLEANING OUT_OF_SERVICE }
enum BedMoveReason { ADMISSION TRANSFER UPGRADE DOWNGRADE ISOLATION }
```

Integrity rules (migration SQL): one open assignment per bed, and one open assignment per
encounter (`endedAt IS NULL`).

**Wards are tenant-defined, but queues are system-seeded (`04`).** Wards therefore don't get
`Queue` rows. Ward worklists ("today's patients on this ward") are **derived** from open bed
assignments. Staff access to inpatients works through a duty profile listing **wards**:
`DutyProfileWard`, the ward counterpart of `DutyProfileQueue`. **[Q 11]**

### 13.2 Deciding to admit

A doctor with `admission.request` creates an **`Admission`** request on the patient's current
`OUTPATIENT` encounter, whether in a clinic or in Emergency. The request is the record of the admit
decision; the encounter itself carries on:

```prisma
model Admission {
  id                   String          @id @default(uuid())
  encounterId          String                         // the encounter being admitted; it becomes INPATIENT at §13.4
  requestedBy          String
  attendingConsultantId String                        // who owns the patient's care
  admittingDiagnosis   String
  requestedWardType    WardType
  requestedBedClass    BedClass?
  urgency              QueuePriority   @default(ROUTINE)
  expectedLengthOfStayDays Int?
  status               AdmissionStatus @default(REQUESTED)
  depositRequired      Decimal?        @db.Decimal(14, 2)
  depositWaivedBy      String?                        // queue.payment.override equivalent, audited
  depositWaivedReason  String?
  requestedAt          DateTime        @default(now())
  admittedAt           DateTime?
  cancelledReason      String?
  preAuthorizationCode String?                        // payer's admission authorisation (10 §6.3)

  encounter            Encounter       @relation(fields: [encounterId], references: [id])

  @@index([encounterId])
}

enum AdmissionStatus {
  REQUESTED           // waiting for deposit / pre-auth / bed
  AWAITING_BED
  ADMITTED
  CANCELLED           // patient declined, condition changed, transferred elsewhere
}
```

Integrity rule (migration SQL): at most one non-`CANCELLED` admission per encounter.

### 13.3 Admission deposit and pre-authorisation

- **Self-pay patients:** an admission deposit equal to the estimated cost (configurable per ward
  type or bed class) must be paid, or covered by the account's `creditLimit`, before the bed is
  assigned. This is the inpatient payment gate. **[Q 4]**
- **Insured patients:** the payer's admission pre-authorisation code is recorded. The patient pays
  only the deposit portion their plan leaves to them.
- **Emergency admissions** skip the deposit. The patient is admitted and the deposit is collected
  afterwards. A waiver can also be recorded with a reason, using the same permission as the queue
  override.

### 13.4 Assigning the bed: the actual admission

The **bed management worklist** shows `REQUESTED`/`AWAITING_BED` admissions, ordered by urgency.
The bed manager or ward nurse (`bed.assign`) chooses a bed matching the ward type, bed class and
gender policy. Then, in one transaction:
1. The encounter's `encounterType` becomes `INPATIENT`, `departmentId` becomes the ward's
   department, and `attendingStaffId` becomes the consultant. Coverage, charges, consultations and
   orders so far stay where they are: it's the same encounter.
2. A `BedAssignment(ADMISSION)` is created and the bed becomes `OCCUPIED`.
3. The admission becomes `ADMITTED` (`admittedAt`). The encounter's open emergency/clinic tasks
   (e.g. Observation) are completed, and a **ward task** is created on the ward's list (§13.6).
4. The `ADMISSION_CLERKING` consultation is due: shown on the ward's worklist until it's signed.

### 13.5 Transfers within the hospital

A ward-to-ward or bed-to-bed move ends the open `BedAssignment` and starts a new one
(`TRANSFER`, `UPGRADE`, `ISOLATION`). The old bed goes to `CLEANING`. Responsibility can move to
another consultant too (`attendingStaffId` changes, audited). It's the same encounter throughout.

### 13.6 The stay

- **The ward task.** Admission puts the patient on their ward's task list, and that task stays
  open for the whole stay: it's what the ward nurse's list of patients is, and it keeps the
  encounter open between medication rounds and ward rounds (§4.1). Physical discharge
  (§13.8) completes it; it's normally the last task, so the encounter closes then. Wards are
  tenant-defined but queues are system-seeded, so the ward list is one seeded ward queue per
  clinical department ("Surgical Ward"), with the ward and bed on the task. **[Q 11]**
- **Other tasks come and go on top of it:** the medication round, the ward round, procedures,
  theatre. Each is its own task on its own list.
- **Ward round worklist** (derived): each admitted patient on the wards in the doctor's duty
  profiles, flagged when there's no `WARD_ROUND` consultation yet today.
- **Orders** during the stay work as in §11. Inpatient prescriptions feed the ward medication
  round (Nursing PRD), not the dispensing counter.
- **Nursing** (medication administration record, observation charts, care plans, fluid balance,
  shift handover): Nursing PRD, writing against the inpatient encounter.
- **Theatre:** Theatre PRD; the patient returns to the same encounter.

### 13.7 Bed-day charges **[Q 7]**

A nightly job posts one `ADMISSION` category charge per occupied bed at **midnight census**, at
the bed class's daily rate (`10` §5, coverage applied by `10` §6). Admission and discharge on the
same day is charged one day. The day of discharge is not charged unless the patient is still in
the bed at census. Upgrades take effect from the next census. These are the most commonly
disputed charges, so the rule has to be unambiguous and printed on the bill.

### 13.8 Discharge

Discharge is a **four-step sequence**, because in practice it's done by four different people:

| # | Step | Who (permission) | Effect |
|---|---|---|---|
| 1 | **Discharge decision** | Attending doctor (`discharge.approve`) | Disposition recorded (`DISCHARGED_HOME`, `TRANSFERRED_OUT`, `LEFT_AGAINST_ADVICE`…); take-home prescriptions ordered |
| 2 | **Discharge summary** | Doctor (`consultation.sign`) | `DischargeSummary` signed: diagnoses, procedures, course in hospital, medication on discharge, follow-up plan |
| 3 | **Billing clearance** | Cashier / billing (`discharge.clear`) | Final charges posted (last bed day, take-home drugs); bill settled, covered, or a documented arrangement recorded **[Q 7]** |
| 4 | **Physical discharge** | Ward nurse (`discharge.complete`) | `dischargedAt`; `BedAssignment` ended; bed → `CLEANING`; the ward task is completed, which closes the encounter if nothing else is open |

```prisma
model DischargeSummary {
  id                 String   @id @default(uuid())
  encounterId        String   @unique
  courseInHospital   String
  proceduresDone     String?
  conditionAtDischarge String
  dischargeMedication String?
  followUpPlan       String?
  instructions       String?                  // printed for the patient
  status             ConsultationStatus @default(DRAFT)
  signedBy           String?
  signedAt           DateTime?
}
```

**Leaving against medical advice (DAMA):** recorded with a signed acknowledgement (as an
attachment) and the doctor's note. Billing clearance still applies.
**Absconded:** disposition `ABSCONDED`. The bed is freed, and the outstanding bill stays on the
account.

### 13.9 Death

Disposition `DIED`, with `timeOfDeath`, the certifying doctor, and cause of death (ICD-coded, the
`Diagnosis` model with `certainty = CONFIRMED`). `Patient.status` becomes `DECEASED` (`06`), every
open queue entry is cancelled, and every appointment cancelled. The bed is freed. Death
certificates, mortuary and body release: out of scope (§22).

## 14. Closing Encounters and Dispositions

### 14.1 Closing: the last task

An encounter **closes when its last task ends**: a station completes its task and sends the
patient nowhere next, or a task is cancelled, and no other station still has a task for the
patient. It's recorded where it happened (`closedAt`, `closedBy`, `closedAtQueueId`). Pharmacy
after dispensing, the cashier after payment, the lab after the sample, the doctor after the
consultation: whichever is last closes it. Completing and cancelling lock the encounter row first,
so two stations finishing at the same moment can't both conclude the other is still working.

- **Results pending don't keep it open.** A result that arrives tomorrow attaches to its order,
  whether the encounter is open or not, and can be delivered to the patient. Having it looked at by
  a doctor is a new encounter: a follow-up (`followUpOfId`, §15.3). Nobody is assigned to review
  results for a patient who doesn't return. (Critical values phoned through by the lab are the
  Laboratory PRD's process.)
- **Closed means no more charges post**, so orders are charged when placed (§11.3).
- **Inpatients** close at physical discharge, when the ward task completes (§13.8).
- **Reopening** a closed encounter (a charge was missed) needs `encounter.reopen`, a reason, and
  is audited.

### 14.2 Unfinished visits: the hospital follows up

**Nothing closes on its own.** A patient who leaves while waiting at the lab didn't finish their
encounter. It's the hospital's duty to reach them and update the system.

- **`GET /encounters/follow-up`** (`encounter.follow_up`) lists open outpatient encounters at the
  branch with no task activity today, with the patient's phone number and remaining tasks.
  Emergency patients (observation can run overnight) and admitted patients aren't listed.
- After reaching the patient, staff either leave the task (they're coming back; check-in continues
  the visit, §3.3) or **cancel the remaining tasks** with the reason and `patientLeft`. Staff with
  `encounter.follow_up` can cancel tasks on any queue at their branch, since the patient's tasks are
  rarely on their own lists. Cancelling the last task closes the encounter with the disposition:
  - `LEFT_WITHOUT_BEING_SEEN` if no clinician ever saw the patient (`firstSeenAt` unset)
  - `LEFT_BEFORE_COMPLETION` if they were seen, then left with tasks unfinished
- An unpaid consultation fee for a patient who left is reversed under §11.3's rule.

### 14.3 Clinical dispositions

`disposition` records the clinical outcome: `DISCHARGED_HOME`, `REFERRED_OUT`, `TRANSFERRED_OUT`,
`LEFT_AGAINST_ADVICE`, `ABSCONDED`, `DIED`, `BROUGHT_IN_DEAD`… Doctors record it where it matters
(`encounter.disposition`), with a note for `LEFT_AGAINST_ADVICE`, `ABSCONDED`, `TRANSFERRED_OUT`
and `REFERRED_OUT`. It doesn't open or close the encounter; tasks do. Deciding to admit is not a
disposition: it's an admission request (§13.2), and the encounter continues.

## 15. Referrals and Follow-up

### 15.1 Internal referral (same hospital)

A doctor refers the patient to another clinic *within the same encounter*:
- a task on the receiving clinic's list (`sourceType = REFERRAL`). Which of its doctors sees the
  patient is settled there, as for any doctors' list (§3.3)
- a `PatientAssignment(reason = REFERRAL)` (`05` §6), which `05` already identifies as triggered
  by referral booking
- the referral note as a `ClinicalNote`. The receiving clinician writes a `Consultation(REFERRAL)`.
- If the specialist can't see the patient today, it becomes a referral `Appointment` (`07`) and a
  future follow-up encounter instead.

### 15.2 External referral and transfer out

`REFERRED_OUT` / `TRANSFERRED_OUT` dispositions record the receiving facility and reason. The
referral letter is a generated document (out of scope, §22). Transfers out of inpatient care
include a discharge summary.

### 15.3 Follow-up visits and the review window

The doctor books a follow-up `Appointment` (`07`). When it's checked in, the new encounter carries
`followUpOfId`. **Many Nigerian hospitals charge a reduced or zero fee for a review within N days**
(often 7–14) of the original consultation. The consultation fee rule (§10.4) checks `followUpOfId`
and the window. **[Q 5]**

## 16. Service-Only Visits

In a hospital, reception sends patients to clinics: you see a doctor first (§3.3). Service-only
visits are mainly for the standalone **Lab** and **Pharmacy** businesses (`01` §4–5), and get their
own check-in flow later. A patient who walks in only for a lab test, a scan or a pharmacy purchase
gets an `OUTPATIENT` encounter with `visitType = SERVICE_ONLY`, in the service's department.
There's no consultation, triage or doctor queue. Reception records
the request (with an external prescription or referral as an attachment when there is one), the
orders are created with `orderedBy` = the receptionist and `externalRequester` = the outside
doctor, and the patient goes straight to the cashier and then the service queue.

Standalone Lab and Pharmacy businesses use only this kind of visit.

## 17. Billing Touchpoints (changes to `10`)

| `10` today | Becomes |
|---|---|
| `Charge.appointmentId` | **`Charge.encounterId`** (required for every clinical charge) |
| Coverage chosen per visit via `Appointment.coverageId` (`10` §5) | **`Encounter.coverageId`** |
| Claims "reviewed per visit" | Claims are batched **per encounter** (`10` §15, the claims PRD) |
| Pre-auth only per allocation | Plus **admission-level** pre-authorisation on `Admission` (§13.3) |
| `D12`: every void needs approval | Narrow exception for unpaid, unfulfilled order cancellations (§11.3) **[Q 6]** |

What gets charged, and when:

| Event | Category | Posted when |
|---|---|---|
| Consultation fee | `CONSULTATION` | Patient queued for the doctor (§10.4) |
| Lab / imaging / procedure | `LABORATORY` / `RADIOLOGY` / `PROCEDURE` | Order placed (§11.3) |
| Drugs | `PHARMACY` | Prescription placed (outpatient); per issue on the ward (Nursing/Pharmacy PRDs) |
| Bed day | `ADMISSION` | Midnight census (§13.7) |
| Theatre | `THEATRE` | Theatre PRD |
| Registration / card | `REGISTRATION` | Registration (`06`, already built) |

## 18. Queues, Departments and Permissions

### 18.1 Queues

Already seeded (`04` §3): Reception, Triage, General Consultation, Emergency, Resuscitation,
Observation, Sample Collection, X-Ray/Ultrasound/CT, Dispensing, Cashier, Insurance.
Added here:
- `PROCEDURE_ROOM_QUEUE` (Nursing): injections and dressings (`01` §3.4)
- `BED_MANAGEMENT_QUEUE` (Nursing or Administration): an admission-request worklist, derived from
  `Admission` rows rather than `QueueEntry` rows
- One **ward queue** per clinical department, for the whole-stay ward task (§13.6) **[Q 11]**
- **Clinics** (§3.3) are seeded with the queues from `CLINIC_CATALOG` in `departments.catalog.ts`:
  each names its department, its nursing station and its doctors' queue. Reception checks patients
  into clinics; departments without clinics (Pharmacy, Laboratory, Accounts…) never appear there.

### 18.2 Permissions

| Key | Grants | Typical holder |
|---|---|---|
| `encounter.create` *(exists)* | Check in; see clinics and their doctors; see a patient's unfinished visit | Reception, emergency nurse |
| `encounter.follow_up` *(built)* | See unfinished visits; cancel any task at the branch when following up (§14.2) | Reception |
| `encounter.cancel` | Cancel an encounter opened in error | Reception supervisor |
| `encounter.disposition` | Record a disposition | Doctor |
| `encounter.reopen` | Reopen a closed encounter | Billing supervisor, records |
| `queue.view`, `queue.manage` *(exist)* | See a task list; re-prioritise; cancel a task with a reason | — |
| `queue.call` *(built)* | Call, start and complete tasks on one's queues, and send the patient on | Every station's staff |
| ~~`queue.send`~~ *(retired)* | Sending needs no key: any staff member may send to the queues on their send lists (§5.7) | — |
| `queue.payment.override` | Release a payment-held entry / waive an admission deposit | Consultant, emergency lead, supervisor |
| `triage.view`, `triage.create` *(built)* | See / record triage and vitals (§8, §9); replace `vitals.record` | Doctor, nurse, pharmacist |
| `consultation.create` *(exists)* | Write a consultation | Doctor |
| `consultation.sign` | Sign consultations and discharge summaries | Doctor (senior, if co-signature applies **[Q 13]**) |
| `order.cancel` | Cancel an order (§11.3) | Ordering doctor |
| `admission.request` | Request admission | Doctor |
| `bed.assign` | Assign / transfer beds | Bed manager, ward nurse |
| `bed.manage` | Configure wards and beds | Administrator |
| `bed.status.update` | Mark a bed clean / out of service | Housekeeping, ward nurse |
| `discharge.approve` *(exists)* | Discharge decision | Doctor |
| `discharge.clear` | Billing clearance | Cashier, billing |
| `discharge.complete` | Physical discharge | Ward nurse |
| `death.record` | Record death and certify | Doctor |

`admission.create` *(exists)* is retired in favour of `admission.request` + `bed.assign`, which
are done by different people.

## 19. APIs

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/clinics` | GET | `encounter.create` | **Built.** Clinics reception picks from (§3.3) |
| `/clinics/:id/consultation-fee?patientId=` | GET | `encounter.create` | **Built.** The fee before check-in; with a patient, whether check-in would charge them (`charged`, `exemption`: `INSURED` / `CONTINUING_SAME_CLINIC`) and their account's balance, credit and credit limit (§10.4) |
| `/encounters` | POST | `encounter.create` | **Built.** Start the encounter (`startEncounter`) at a clinic, in one transaction: closes the patient's open encounter at this branch (§3.3), charges the fee to the account (§6.2) and creates the chosen tasks as `AWAITING_SERVICE`; 409 `PATIENT_ADMITTED` or `INSUFFICIENT_FUNDS` |
| `/charges/patients/:patientId` | GET | `billing.view` | **Built.** Every charge the patient incurred, newest first, whoever pays: date and time, kind, the service or item (`description`, `billableItem`), `quantity`, `unitPrice`, `amount`, and `shares`, one per party that owes part of it (`owedBy` ACCOUNT / PAYER / HOSPITAL, `amount, paid, outstanding, paymentStatus`, plus the account, or the payer, plan and member number); `encounterId`, `limit`, `offset`. What the patient must pay is a separate list |
| `/encounters/open?patientId=` | GET | `encounter.create` | **Built.** The patient's unfinished visit at this branch and its remaining tasks |
| `/encounters/follow-up` | GET | `encounter.follow_up` | **Built.** Unfinished visits with no task activity today (§14.2) |
| `/queues/sendable` | GET | any staff | **Built.** The queues the caller can send patients to (§5.7) |
| `/encounters/:id/tasks` | POST | any staff | **Built.** Put the patient on one of those lists, e.g. billing |
| `/duty-profiles/:id/send-queues` | POST / DELETE | `duty_profile.manage` | **Built.** Manage a profile's send list |
| `/appointments/:id/check-in` | POST | `encounter.create` | Check in a booking: creates the encounter |
| `/encounters/:id` | GET | access rule (`05` §7) | Encounter with its entries, triage, consultations, orders, charges |
| `/encounters/:id/cancel` | POST | `encounter.cancel` | Opened in error |
| `/encounters/:id/disposition` | POST | `encounter.disposition` | Record the disposition |
| `/encounters/:id/reopen` | POST | `encounter.reopen` | With reason |
| `/patients/:id/encounters` | GET | `patient.view` | **Built.** Encounter history (the timeline `06` §6 aggregates), newest first: `{ count, docs }`. Filters `status` (one or more), `encounterType`, `visitType` (one or more), `clinicId`, `from` / `to` (arrival); `search` an encounter code (matched by number) or words in the reason for visit; `limit` (20) / `offset`. Each: `id`, `code`, `arrivedAt`, `encounterType`, `visitType`, `status`, `reasonForVisit`, `closedAt`, `clinic`, `doctor`: the clinician who saw the patient (`servedBy` on the doctors' task, the latest if seen more than once; null while waiting; the consultation's clinician once consultations are built). Remaining tasks are on `GET /encounters/:id`. Diagnosis is added with consultations |
| `/queues/mine` | GET | `queue.view` | **Built.** The caller's queues (duty profiles) with patients on each list at their branch: `total`, `waiting`, `held`, `called`, `inService` |
| `/queues/:id/entries` | GET | queue in duty profile | **Built.** Live task list at this branch (ordered, §5.2); `?status=` (one or more active statuses) and `?search=` (name, ticket or patient number); `patients` counts the whole list by status |
| `/queue-entries/:id/{call,start}` | POST | `queue.call` | **Built.** §5.3 |
| `/queue-entries/:id/complete` | POST | `queue.call` | **Built.** Finish the task; `nextQueueId` sends the patient on, otherwise the encounter closes if it was the last task (§5.7, §14.1) |
| `/queue-entries/:id/cancel` | POST | `queue.manage` | **Built.** Cancel with a reason; `patientLeft` records the leaving disposition (§14.2) |
| `/queue-entries/:id/priority` | PATCH | `queue.manage` | Raise / lower, with reason |
| `/queue-entries/:id/release-hold` | POST | `queue.payment.override` | Override a payment hold, with reason |
| `/encounters/:id/triage`, `/encounters/:id/vitals`, `/vitals/:id` | | `triage.view` / `triage.create` | **Built.** §9.1 |
| `/encounters/:id/consultations` | POST | `consultation.create` | Start a consultation |
| `/consultations/:id` / `…/sign` | PATCH / POST | `consultation.create` / `consultation.sign` | Edit draft / sign |
| `/encounters/:id/admissions` | POST | `admission.request` | Request admission |
| `/admissions/:id/assign-bed` | POST | `bed.assign` | Admit into a bed (§13.4) |
| `/encounters/:id/bed-transfer` | POST | `bed.assign` | Transfer |
| `/wards`, `/wards/:id/beds` | CRUD | `bed.manage` | Ward and bed set-up |
| `/beds/:id/status` | PATCH | `bed.status.update` | Clean / out of service |
| `/wards/:id/patients` | GET | ward in duty profile | Derived ward list / round worklist |
| `/encounters/:id/discharge-summary` | PUT / POST sign | `consultation.create` / `.sign` | Discharge summary |
| `/encounters/:id/discharge/clear` | POST | `discharge.clear` | Billing clearance |
| `/encounters/:id/discharge/complete` | POST | `discharge.complete` | Physical discharge |

Queue boards and worklists need **live updates**: server-sent events or WebSocket, over the
hospital LAN. Polling a busy outpatient department every few seconds per screen doesn't scale.

## 20. Open Decisions

Each has a recommended answer, which is what the document above assumes.

| # | Question | Recommendation |
|---|---|---|
| **Q1** | Make `Encounter` the anchor for all care, demoting `Appointment` to "a booking that creates an encounter at check-in"? This revises `07` and `08`. | **Decided (2026-10-19): yes.** Nothing else covers emergency, inpatient and service-only visits. |
| **Q2** | Emergency → admission: one encounter that changes class, or two linked encounters? | **Decided (2026-10-19): one encounter.** It changes `encounterType` from `OUTPATIENT` to `INPATIENT` at bed assignment. The same applies to clinic → admission. Emergency is a department, not an encounter type (§3.1). Boarding and emergency time come from `Admission` timestamps. |
| **Q3** | When does an outpatient encounter close? What about results that arrive tomorrow? | **Decided (2026-10-19): when its last task ends** (completed with nowhere next, or cancelled), regardless of pending results (§14.1). Nothing closes on its own: unfinished visits are followed up by staff (§14.2). Results attach to orders and can be sent to the patient; having them reviewed by a doctor is a new follow-up encounter. Nobody is assigned to review results for patients who don't return. Reopening (for a missed charge) is audited. |
| **Q4** | Which queues gate on payment? Admission deposit amounts? Does time spent unpaid count as time in the queue? | **Decided (2026-10-19) for consultation:** billing is a task, not a gate; each hospital chooses `consultationPayment` (`BEFORE` holds the doctor's task, `AFTER` holds nothing) and a `maxUnpaidBeforeHold` tolerance (§6). **Never** in emergency. `readyAt` resets on release. Still open: holds for orders, and deposit amounts per ward type / bed class. |
| **Q5** | Price catalog: build a minimal one now (consultation fees by clinic × clinician grade × first/follow-up, bed rates, review window), or as its own PRD first? | **Its own PRD (12), before building this.** Every module here needs prices, and they'd otherwise be invented piecemeal. |
| **Q6** | Charge orders when placed or when fulfilled? Must cancelling an unpaid, undelivered order need a second approver? | **Charge when placed.** **Auto-void on cancellation if unpaid and undelivered**: a narrow exception to `10` D12, attributed and reasoned. |
| **Q7** | Bed-day rule (midnight census?). May discharge be blocked by an unpaid bill? | **Midnight census** (§13.7). **Billing clearance is recorded but never physically blocks discharge.** The debt stays on the account, with a documented arrangement. Detaining patients over bills is something the system shouldn't facilitate. |
| **Q8** | Emergency triage scale? | **SATS** by default, configurable. |
| **Q9** | Unidentified patients: who merges a temporary record with an existing one, and is patient merge in scope now? | Quick registration now. **Patient merge is its own feature**: it rewrites history across every table and needs its own approval and audit design. |
| **Q10** | Can a patient wait in two queues at once (lab and pharmacy)? How do booked appointments interleave with walk-ins? | **Decided (2026-10-19): yes.** Queues are staff task lists, not lines: each station works its own task, with no "with another station" hold (§5.6). Bookings ordered by slot time with a grace window (still open). |
| **Q11** | Wards are tenant-defined but queues are system-seeded. How do staff get inpatient access? | Admission creates a **ward task** that lasts the whole stay (§13.6). Recommended: one seeded ward queue per clinical department, with the ward and bed on the task; ward staff get it through their duty profiles. |
| **Q12** | After an encounter closes, who can still open the record? Are medico-legal / sensitive records (HIV, psychiatric) restricted? | Post-encounter access needs a `PatientAssignment` (`05`). **Restricted records with "break-the-glass" access** are a separate feature, flagged as needed. |
| **Q13** | Do junior doctors' consultations need senior co-signature? Do nurse practitioners consult? | **Configurable per duty profile** (`requiresCosign`). Off by default. |
| **Q14** | Does nursing (medication administration, observation charts, care plans, handover) belong in this PRD? | **No: a Nursing PRD.** This one only defines the encounter they write against. |
| **Q15** | Specialty consultation templates (antenatal, dental, eye) in v1? | **No.** General structure in v1, with templates as a follow-up feature. |

## 21. Why / Where / Why Not

- **Why `Encounter` instead of extending `Appointment`.** An appointment is a promise about the
  future; an encounter is a record of what happened. Most encounters never had an appointment, and
  many appointments never become encounters (no-shows). Forcing one to be the other means every
  emergency visit and admission fakes a booking.
- **Why `QueueEntry` is a stored record, not derived.** Unlike billing worklists (`10` §9, derived
  from money state), "this patient is waiting at this station" is primary information. Nothing
  else implies it, and its timestamps (entered, called, started, completed) are the raw material
  for every waiting-time measure a hospital is judged by.
- **Why billing is a task, not a gate.** A hold on every station made the patient stop and pay before
  anything happened, even vitals. As a task, payment runs in parallel with the nurse, keeps the
  visit open until it's settled, and lets each hospital decide where (and whether) to wait for it.
- **Why send lists are separate from work queues.** A work queue gives access to its patients'
  records (`05` §7). Reception sending a patient to billing must not be able to read billing's list.
- **Why queues are task lists, not lines.** A queue entry is a station's job for the patient, and
  a patient legitimately has several at once: lab and pharmacy, or on a ward the medication round
  and the ward round, with a nurse and a doctor at the bedside together. A "one place at a time"
  rule would block real work. Only one active task per encounter per queue is enforced.
- **Why an encounter closes on its last task.** It matches how the visit actually ends: whichever
  station sees the patient last lets them go. No doctor has to remember to record a disposition,
  and no end-of-day job has to guess.
- **Why nothing closes automatically.** A patient who left mid-visit didn't finish it. Closing it
  silently hides that from the hospital, whose job is to reach them (§14.2).
- **Why clinics, not departments, at reception.** Patients say what kind of doctor they're seeing,
  not which department. Not every department runs a clinic, and some run several.
- **Why the system never records the doctor a patient wanted.** Which doctor sees a patient is
  settled at the doctors' list, between the patient and whoever is working it. The system only needs
  the fact of who saw them (`servedBy`); a requested doctor would be a promise it can't keep and
  doesn't need.
- **Why emergency → admission is one encounter.** It's one episode of care for the patient, the
  clinicians and the bill. Everything two encounters would have given is still available: emergency
  time and boarding time from `Admission` timestamps, and a payer split of emergency vs stay charges
  at `admittedAt`.
- **Why emergency isn't an encounter type.** An emergency visit can end in going home (outpatient)
  or admission (inpatient), so it can't sit alongside them. "Emergency" is where the patient was
  treated (the department) and how they came (`visitType`). The type only answers "was the patient
  admitted?", the question bed-day charges, discharge, ward access and admission pre-auth depend on.
- **Why encounters have no human-readable number.** Patients remember dates, not visit numbers,
  and staff find a visit by the patient's number and the date. The system uses the UUID. An
  organisation-wide counter would also make every check-in in the organisation queue on one locked
  row. If claims or printouts ever need one, it can be added and backfilled in `arrivedAt` order.
  Queue tickets are different: they're called aloud, and their counter is per queue, branch and day.
- **Why check-in places the patient in a queue in the same transaction.** An encounter with no
  queue entry is a patient nobody can see on any worklist. Doing both in one write means reception
  can't forget to send the patient anywhere.
- **Why discharge is four steps.** The decision, the summary, the money and the bed are four
  people's jobs, at four different times. One "discharge" button either blocks on whoever's
  slowest or lets someone skip a step.
- **Why wards aren't queues.** `04` keeps queues system-seeded because they carry logic. Wards are
  physical places the hospital defines, change often, and are worked as a list of patients, not
  a line.

## 22. Explicitly Out of Scope for v1

- **Nursing:** medication administration record, observation chart orders, care plans, fluid
  balance, handover (Nursing PRD).
- **Theatre:** booking, pre-op checklist, anaesthesia record, operation note, recovery (Theatre
  PRD).
- **Laboratory, Radiology, Pharmacy fulfilment** (their PRDs). This document only creates their
  queue entries and orders.
- **Price catalog** (proposed PRD 12, **[Q 5]**).
- **Generated documents:** medical certificates, sick notes, referral letters, police reports,
  death certificates, discharge summary print layout.
- **Patient merge** for duplicate / unidentified records **[Q 9]**.
- **Restricted / break-the-glass records** **[Q 12]**.
- **Specialty consultation templates** **[Q 15]**.
- **Mass-casualty mode, telemedicine, home visits.**
- **Mortuary and body release.**
- **Display-board and SMS "you're next" hardware/provider integration.** Only the ticket and the
  event stream are defined here.
- **Leave of absence** during an admission.

## 23. Changes to Existing Documents and Code

| Where | Change |
|---|---|
| `07` `Appointment` | Booking only. Check-in creates an `Encounter` (`appointmentId` on the encounter). The existing schema's `Appointment` (with `consultationTypeId`, `checkin`) is replaced by `07`'s model plus this link. |
| `08` `Consultation` | `appointmentId @unique` → `encounterId` (+ `queueEntryId?`), `consultationType`, `Diagnosis.certainty` |
| `08` `Vitals` | `appointmentId` → `encounterId`; new fields and `context` (§9) |
| `08` orders | `encounterId` required, `consultationId` optional, `STAT` priority |
| `04` `Queue` | New Procedure Room, Bed Management and per-department ward queues. No per-queue payment flag: payment holds follow hospital policy (§6) |
| `04` `Clinic` | **Built.** New model and `CLINIC_CATALOG`, seeded with departments and queues (§3.3, §18.1) |
| Frontend enums | **Built.** `src/shared/enums/encounters/encounter.enums.ts`, served by `GET /enums` (`encounters` group) |
| `Organization` | `consultationFee` (interim flat fee until PRD 12); `consultationPayment`, `maxUnpaidBeforeHold` (§6) |
| `05` | `DutyProfileSendQueue` (send lists); Receptionist seeded with billing + clinic nursing stations |
| `05` | `DutyProfileWard`; the access rule's "in queue Q" is a `QueueEntry` |
| `06` `Patient` | `isUnidentified`; quick-registration path |
| `10` | `Charge.encounterId`, `Encounter.coverageId`, admission pre-auth, the D12 exception |
| Schema | `ConsultationType` model (currently just a name) is superseded by the price catalog (PRD 12) |
| Permissions catalog | §18.2 |
