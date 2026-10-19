# Feature PRD — Encounters: Arrival, Queues, Consultation, Emergency & Admission

Status: Draft — decisions pending (§20) · Last updated: 2026-10-13
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
| **Encounter** | One continuous episode of care at one branch. "Visit" in everyday language. Outpatient encounters usually last hours; inpatient encounters last days or weeks. |
| **Appointment** | A booking for a future outpatient encounter (`07`). It does nothing clinically until check-in creates the encounter. |
| **Queue entry / ticket** | The patient's place at one station. An encounter produces many queue entries over its life. |
| **Consultation** | A clinician's structured, signed note within an encounter. An encounter can have several. |
| **Disposition** | How an encounter ended clinically: home, admitted, transferred, left before being seen, died… |
| **Discharge vs close** | *Discharged* = clinically finished (the patient may still be at the cashier). *Closed* = financially finished: no more charges can post. |

## 3. Arrival and Identification

### 3.1 Every way a patient arrives

| Arrival mode | Typical path | Encounter class |
|---|---|---|
| `WALK_IN` | Reception → cashier → triage → doctor | `OUTPATIENT` |
| `APPOINTMENT` | Check-in of an existing `Appointment` → (cashier) → triage → doctor | `OUTPATIENT` |
| `REFERRAL_IN` | From another facility with a letter; reception records the referrer | `OUTPATIENT` or `EMERGENCY` |
| `SELF_PRESENTED_EMERGENCY` | Walks or is carried into the emergency department | `EMERGENCY` |
| `AMBULANCE` | Brought by ambulance | `EMERGENCY` |
| `POLICE` | Brought by police (assault, accident, custody): medico-legal by default | `EMERGENCY` |
| `TRANSFER_IN` | Inter-facility transfer, usually straight to a ward | `INPATIENT` (or `EMERGENCY` first) |
| `SERVICE_ONLY` | Comes only for a lab test, scan or pharmacy purchase, with no consultation (`01` §3.6, §3.7) | `SERVICE_ONLY` |
| `BIRTH` | Born in the hospital (newborn registration, `06` §4) | `INPATIENT` (linked to the mother's) |

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

### 3.3 Opening the encounter

On arrival, reception (or emergency triage) records:

- `encounterClass`, `arrivalMode`, `departmentId` (the clinic or service being visited)
- `reasonForVisit` (in the patient's words, short)
- **coverage for this encounter** (`10` §5): by default the patient's highest-priority active
  coverage, or self-pay if the patient chooses. Requires `coverage.select`.
- referral details, if `REFERRAL_IN`
- the first `QueueEntry` (§5): usually the cashier or triage queue, depending on the path.

An encounter can't be opened for a patient who already has an open encounter of the same class at
the same branch. Reception gets the existing one instead, which stops double check-ins. A patient
*can* have one open outpatient encounter and one open inpatient encounter at the same time, which
happens when an admitted patient is taken to an outpatient specialist clinic. **[Q 2]**

## 4. `Encounter`

```prisma
model Encounter {
  id                String          @id @default(uuid())
  encounterNumber   String          @unique              // human-readable, e.g. "E-2026-004211"
  patientId         String
  branchId          String
  encounterClass    EncounterClass
  status            EncounterStatus @default(ARRIVED)
  arrivalMode       ArrivalMode
  departmentId      String?                              // clinic / service visited (Outpatient, Dental, Emergency…)
  appointmentId     String?         @unique              // when checked in from a booking (07)
  parentEncounterId String?                              // e.g. the ED encounter an admission came from
  followUpOfId      String?                              // the earlier encounter this one follows up (§15.3)
  attendingStaffId  String?                              // responsible clinician; consultant for inpatients
  reasonForVisit    String?
  ageAtArrivalDays  Int?                                 // snapshot: age on the day the encounter opened (06 §2.7); null if DOB unknown
  ageGroup          AgeGroup?                            // snapshot: group under the cutoffs in force that day
  acuity            Acuity?                              // latest triage acuity, denormalised for queue ordering
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
  dischargedAt      DateTime?
  closedAt          DateTime?
  closedBy          String?
  cancelledReason   String?
  createdBy         String
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  patient           Patient         @relation(fields: [patientId], references: [id])
  branch            Branch          @relation(fields: [branchId], references: [id])
  department        Department?     @relation(fields: [departmentId], references: [id])
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
  admission         Admission?
  charges           Charge[]

  @@index([patientId, arrivedAt])
  @@index([branchId, status, encounterClass])
}

enum EncounterClass {
  OUTPATIENT
  EMERGENCY
  INPATIENT
  SERVICE_ONLY      // lab / imaging / pharmacy only, no consultation
}

enum EncounterStatus {
  ARRIVED           // checked in, not yet seen by a clinician
  IN_PROGRESS       // seen by at least one clinician
  DISCHARGED        // clinical disposition recorded; may still owe at the cashier
  CLOSED            // financially closed: no further charges may post
  CANCELLED         // opened in error; nothing clinical recorded
}

enum ArrivalMode {
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

enum Acuity {
  RED               // immediate
  ORANGE            // very urgent (≤10 min)
  YELLOW            // urgent (≤60 min)
  GREEN             // routine (≤4 h)
  BLUE              // dead on arrival
}

enum Disposition {
  DISCHARGED_HOME
  ADMITTED                  // an INPATIENT child encounter was opened (§13)
  TRANSFERRED_OUT           // to another facility
  REFERRED_OUT              // sent elsewhere for care, not as an inpatient transfer
  LEFT_WITHOUT_BEING_SEEN   // left before a clinician saw them
  LEFT_AGAINST_ADVICE       // discharged against medical advice (DAMA), documented
  ABSCONDED                 // left without notice after being seen / while admitted
  DIED
  BROUGHT_IN_DEAD
  SERVICE_COMPLETED         // SERVICE_ONLY encounters
}
```

**Age snapshot.** `ageAtArrivalDays` and `ageGroup` are computed from the patient's date of birth
and the organisation's cutoffs when the encounter opens, and never recalculated. Reports, billing
rules and clinical history therefore keep showing what applied at the time, even if a cutoff
changes or a date of birth is corrected later (`06` §2.7). Days, not years, because neonatal care
needs that precision. Both are null when the date of birth is unknown. They're computed by
`ageSnapshot()` (`src/patients/age-group.ts`), already built and tested, which encounter creation
calls.

### 4.1 Lifecycle

```
ARRIVED ──first clinician contact──▶ IN_PROGRESS ──disposition──▶ DISCHARGED ──bill closed──▶ CLOSED
   │                                                                  ▲
   └──── left before being seen (LEFT_WITHOUT_BEING_SEEN) ────────────┘
ARRIVED ──opened in error, nothing recorded──▶ CANCELLED
```

- **`firstSeenAt`** is set by the first triage, vitals, consultation or service-delivery action.
  It's the door-to-clinician timestamp.
- **Disposition** is a clinical decision (§14). Recording it ends the clinical part and closes or
  redirects every open queue entry.
- **`DISCHARGED` → `CLOSED`** happens when the encounter's charges are final (§14.3). Outpatient
  encounters close automatically **[Q 3]**. Inpatient encounters close through discharge billing
  clearance (§13.8).
- **`CANCELLED`** is only allowed while nothing clinical or financial is attached. Otherwise the
  encounter needs a disposition.

### 4.2 Linked encounters

- **Emergency → admission:** the admission is a **new `INPATIENT` encounter** whose
  `parentEncounterId` points at the emergency encounter. The emergency encounter ends with
  `disposition = ADMITTED`. **[Q 2]**
- **Inpatient → theatre → back to ward:** stays *within* the inpatient encounter. Theatre is a
  queue and a procedure record, not a new encounter (the Theatre PRD).
- **Mother → newborn:** the baby's `INPATIENT` encounter has `parentEncounterId` = the mother's
  delivery encounter. The two are linked, but the baby's care is billed and recorded separately.
- **Follow-up:** `followUpOfId` points at the encounter being followed up. This drives the
  follow-up fee window (§15.3).

## 5. `QueueEntry`: a patient's place at a station

### 5.1 Model

```prisma
model QueueEntry {
  id              String           @id @default(uuid())
  encounterId     String
  patientId       String                              // denormalised for worklist queries
  queueId         String
  branchId        String
  ticketNumber    String                              // "OPD-023": per queue, per day (§5.4)
  priority        QueuePriority    @default(ROUTINE)
  priorityReason  String?                             // why it was raised (audited)
  status          QueueEntryStatus @default(WAITING)
  holdReason      HoldReason?                         // when status = HELD
  assignedStaffId String?                             // a specific clinician (booked doctor, named referral)
  roomId          String?
  sourceType      String?                             // what put them here: "LAB_ORDER", "PRESCRIPTION", "REFERRAL"…
  sourceId        String?
  fromEntryId     String?                             // the entry that routed the patient here
  enteredAt       DateTime         @default(now())
  readyAt         DateTime         @default(now())    // when it became callable (after a hold); orders the queue
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
  @@index([assignedStaffId, status])
}

enum QueuePriority {
  EMERGENCY        // jumps everything
  URGENT
  ROUTINE
}

enum QueueEntryStatus {
  WAITING          // callable
  HELD             // in the queue but not callable yet (holdReason)
  CALLED           // called to the station; patient walking over
  IN_SERVICE       // being attended to
  COMPLETED
  NO_SHOW          // called repeatedly, didn't come (§5.5)
  TRANSFERRED      // moved to another queue without being served here
  CANCELLED        // order cancelled / encounter ended
}

enum HoldReason {
  AWAITING_PAYMENT     // the payment gate (§6)
  AWAITING_PREAUTH     // payer pre-authorisation pending (10 §6.3)
  AWAITING_RESULT      // e.g. doctor review waiting on a lab result
  PATIENT_AWAY         // patient is being served at another station (§5.6)
}
```

**Database integrity rules** (in migration SQL, since Prisma can't express them):
- At most one *active* entry (`WAITING`, `HELD`, `CALLED`, `IN_SERVICE`) per encounter per queue.
- At most one `CALLED` or `IN_SERVICE` entry per encounter across all patient-facing queues.
  A person can only be physically in one place.

### 5.2 Ordering

A queue's callable list is the `WAITING` entries ordered by **priority** (`EMERGENCY` > `URGENT` >
`ROUTINE`), then **acuity** for emergency queues (RED > ORANGE > YELLOW > GREEN), then
**`readyAt`**. `readyAt` is reset when a hold is released, so time spent unpaid doesn't count as
time in line. **[Q 4]** Booked appointments are ordered by their slot time, plus a configurable
grace window; walk-ins fill the gaps. **[Q 10]**

Raising priority requires `queue.manage` and a `priorityReason`, and is audited.

### 5.3 Calling and serving

- **Call next:** an atomic update (`… WHERE status = 'WAITING'`). Two doctors pressing "call next"
  at once can never get the same patient. Sets `CALLED`, `calledAt`, `calledBy`, `callCount + 1`,
  and the room.
- **Start:** `IN_SERVICE`, `startedAt`. The first clinical start sets `Encounter.firstSeenAt` and
  moves the encounter to `IN_PROGRESS`.
- **Complete:** `COMPLETED`, `completedAt`, `servedBy`. The clinician then routes the patient
  (§5.7).
- **Assigned entries:** an entry with `assignedStaffId` only appears in that clinician's "call
  next", unless reassigned. Unassigned entries can be called by anyone on duty in that queue.

### 5.4 Ticket numbers

`ticketNumber` = the queue's short code + a daily sequence (`OPD-023`), reset every day per queue.
It's what gets announced or shown on a display board, so patients never hear their name called
across a waiting room. The daily sequence uses a `QueueTicketCounter(queueId, date, lastNumber)`
row, incremented under a row lock.

### 5.5 Patients who don't respond

Each call increments `callCount`. After **3** calls (configurable per queue), the entry becomes
`NO_SHOW`. Reception can re-queue it, keeping its original `enteredAt` but taking a new `readyAt`.
An encounter whose every entry ended `NO_SHOW` before any clinician saw the patient gets the
disposition `LEFT_WITHOUT_BEING_SEEN` at end of day (§14.2).

### 5.6 Parallel tracks

One consultation can send the patient to the lab *and* the pharmacy (`01` §2). Both entries
are `WAITING`, but only one can be `CALLED`/`IN_SERVICE` at a time (§5.1). While the patient is
being served in one queue, their entry in the other queue shows **"with another station"**
(`HELD / PATIENT_AWAY`, set automatically). They don't lose their place: when the first station
completes, the hold lifts with their original `readyAt` kept. **[Q 10]**

Object worklists (sample processing, result verification, image reporting) are **not** queue
entries. Those are records waiting in their department's worklist, and the patient isn't
involved (`04`, `01` §2).

### 5.7 Routing: where next?

When a station completes an entry, the clinician chooses where the patient goes next. The system
**suggests** a default per queue:

| From | Default next |
|---|---|
| Reception | Cashier (if the payment gate applies), otherwise Triage |
| Cashier | Whatever queue the held entry was waiting for |
| Triage | The doctor queue of the encounter's department |
| Doctor | Created by orders: lab, imaging, pharmacy, procedure room… Otherwise the cashier, or discharge |

Routing creates the next `QueueEntry` with `fromEntryId` set. Orders create their own entries
(`sourceType`/`sourceId` = the order), so a lab order puts the patient in Sample Collection
automatically.

### 5.8 Access

A `QueueEntry` in queue Q is the fact `05` §7 depends on: "patient P′ is currently in queue Q".
Staff whose duty profiles include Q can open that patient's record and act within their
permissions. The entry stays the access basis until the encounter is closed. After that, access
needs a `PatientAssignment` or a new encounter. **[Q 12]**

## 6. The Payment Gate

`01-application-flow.md` puts the cashier *before* service in most chains: the consultation fee is
paid before seeing the doctor, and lab tests are paid before the sample is taken. This is
configured **per queue**:

```prisma
// added to Queue (04)
paymentGate   Boolean @default(false)   // entries arrive HELD until their charges are settled
shortCode     String                    // "OPD" — ticket prefix (§5.4)
noShowAfterCalls Int  @default(3)
```

**How it works:**
1. When an entry is created in a gated queue, the charges it depends on post first. For a
   consultation, the consultation fee (§10.4) posts against the entry. For an order, the order's
   charges post (§11.3). The entry starts `HELD / AWAITING_PAYMENT`.
2. The gate is satisfied when every **`ACCOUNT`** allocation of those charges (`10` §6) is
   `PAID`, *or* the account's outstanding amount is within its `creditLimit`. The payer's
   share doesn't need to be paid now, but a payer share in `PENDING_AUTH` holds the entry as
   `AWAITING_PREAUTH`.
3. The hold lifts automatically when a deposit or approval satisfies it. The cashier doesn't
   have to "send the patient back".
4. **Override:** `queue.payment.override` releases a held entry without payment (for example, the
   consultant says "see him now"). The debt stays on the account. The override is audited with a
   reason and shows on the Cashier queue.

**Never gated** **[Q 4]**:
- **Emergency queues.** Stabilise first, bill after. Nigerian law requires it for gunshot
  victims (Compulsory Treatment and Care for Victims of Gunshot Act, 2017), and it's sound
  practice for every emergency.
- **Inpatient encounters.** Charges accrue to the stay. The admission deposit (§13.3) is the
  inpatient gate.

Default gates by queue: General Consultation ✔, specialist clinics ✔, Sample Collection ✔,
Imaging ✔, Dispensing ✔, Triage ✗, every Emergency queue ✗.

## 7. Outpatient Flow, End to End

| # | Station (queue) | Who | Data written |
|---|---|---|---|
| 1 | Reception | Receptionist | Patient found/registered (`06`); `Encounter(OUTPATIENT, ARRIVED)`; coverage selected; `QueueEntry` for the doctor queue (held if gated) or triage |
| 2 | Cashier | Cashier | Consultation fee `Charge` (posted at step 1); deposit / payment applied (`10` §7); hold lifts |
| 3 | Triage | Nurse | `TriageAssessment` (basic) + `Vitals`; `firstSeenAt`; route to the doctor queue |
| 4 | Doctor | Doctor | `Consultation` (DRAFT → SIGNED), `Diagnosis`, orders; each order creates `Charge`s and a `QueueEntry` in its service queue |
| 5a | Sample Collection / Imaging | Lab / radiology | Fulfilment (their PRDs); results go to the doctor's results-ready worklist |
| 5b | Pharmacy (Dispensing) | Pharmacist | Dispensing (Pharmacy PRD) |
| 5c | Procedure room | Nurse | Injection / dressing recorded |
| 6 | Doctor (review) | Doctor | Optional same-day result review: a new entry in the doctor queue, assigned to the same doctor, `sourceType = RESULT_REVIEW`; a second `Consultation(RESULT_REVIEW)` |
| 7 | — | Doctor | Disposition: `DISCHARGED_HOME` (+ follow-up `Appointment`), `ADMITTED` (§13), `REFERRED_OUT`… |
| 8 | Cashier | Cashier | Anything still owed is collected or left on the account (`10` §6.6) |
| 9 | — | System | Encounter `CLOSED` (§14.3) |

Specialist clinics (dental, eye, ENT, antenatal, physiotherapy) use exactly this chain with their
own department, queue, consultation template and fees (`01` §3.2).

## 8. Triage

Two flavours share one model:

- **Outpatient triage:** vitals plus a short chief complaint, to prioritise the doctor queue. No
  acuity scale required.
- **Emergency triage:** a formal acuity scale. Recommended default: the **South African Triage
  Scale** (colour-coded RED/ORANGE/YELLOW/GREEN/BLUE, with a vitals-based early warning score),
  which is widely used in Nigerian emergency departments. The scale is configurable per
  organisation. **[Q 8]**

```prisma
model TriageAssessment {
  id             String       @id @default(uuid())
  encounterId    String
  queueEntryId   String?
  scale          TriageScale
  acuity         Acuity?                              // required for emergency scales
  earlyWarningScore Int?                              // e.g. SATS TEWS, computed from the linked vitals
  chiefComplaint String
  painScore      Int?                                 // 0–10
  discriminators String[]                             // e.g. "active seizure", "chest pain"
  vitalsId       String?
  notes          String?
  triagedBy      String
  triagedAt      DateTime     @default(now())

  encounter      Encounter    @relation(fields: [encounterId], references: [id])
  vitals         Vitals?      @relation(fields: [vitalsId], references: [id])

  @@index([encounterId, triagedAt])
}

enum TriageScale {
  OPD_BASIC
  SATS
  ESI
  MANCHESTER
}
```

**Re-triage** adds a new row. It never edits the old one. The latest acuity is copied to
`Encounter.acuity` and reorders the patient's open emergency queue entries. A patient whose
waiting time exceeds their acuity's target (RED immediately, ORANGE 10 min, YELLOW 60 min,
GREEN 4 h) is flagged on the queue board for re-triage.

## 9. Vitals (re-anchored from `08` §3)

`Vitals.appointmentId` becomes **`encounterId`**, so the same model serves outpatient triage,
emergency observations and inpatient ward observations. `08` §3 had deferred inpatient vitals to a
later feature; they live here now.

Added fields: `gcs Int?` (Glasgow Coma Scale, 3–15), `bloodGlucose Decimal?` (mmol/L),
`painScore Int?`, `headCircumference Decimal?` and `muac Decimal?` (paediatrics), and `context`
(`TRIAGE`, `OBSERVATION`, `WARD_ROUND`, `PRE_OP`, `POST_OP`). Units are fixed per field and
documented in the API (kg, cm, °C, mmHg, %, breaths/min, beats/min), never free text.

**Inpatient observation charts** (frequency orders such as "4-hourly vitals", fluid balance,
neuro-observations) belong to the Nursing PRD. They write `Vitals(context = OBSERVATION)` rows
against the inpatient encounter.

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

The fee posts when the patient is queued for the doctor, against that `QueueEntry`
(`sourceType = CONSULTATION_FEE`). That way the payment gate (§6) can hold the entry, and the
cashier sees a concrete bill before the patient sees anyone. The amount depends on:

- the **department / clinic** (general outpatient vs specialist clinic)
- the **clinician grade** (medical officer vs consultant): very common in Nigerian practice
- **first visit vs follow-up within the window** (§15.3)

This requires a price catalog. **[Q 5]**

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

### 12.1 Path

| # | Station (seeded queues, `04` §3) | Data written |
|---|---|---|
| 1 | Arrival: triage desk or resuscitation bay directly | Quick registration if needed (§3.2); `Encounter(EMERGENCY)`; `arrivalMode`; medico-legal flag |
| 2 | **Triage Queue** | `TriageAssessment(SATS)` with acuity; RED goes straight to Resuscitation |
| 3 | **Resuscitation Queue** (RED) / **Emergency Queue** (others) | `Consultation(EMERGENCY)`, STAT orders, procedures, vitals |
| 4 | **Observation Queue** | Held for monitoring: repeated vitals, response to treatment, waiting for results |
| 5 | Disposition | Home / admit (§13) / theatre / transfer out / DAMA / died / absconded |
| 6 | Cashier | After stabilisation, never before (§6) |

### 12.2 Emergency-specific rules

- **No payment gate**, anywhere in the emergency department (§6).
- **Treatment before identity:** quick registration (§3.2). Unidentified patients are allowed.
- **Medico-legal cases** (`isMedicoLegal`: assault, road traffic accident, gunshot, police
  custody): record `policeReportNumber`. Reports, photographs and certificates for the police are
  generated documents (out of scope, §22). Access to these records may be restricted. **[Q 12]**
- **Brought in dead:** `Encounter(EMERGENCY)` with `disposition = BROUGHT_IN_DEAD` and the time
  confirmed. No queue path. `Patient.status = DECEASED` (`06`).
- **Boarding:** a patient admitted but waiting for a bed stays in the emergency encounter, in the
  Observation queue, until a bed is assigned (§13.4). Time spent boarding is a reportable KPI.
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

A doctor with `admission.request` creates an **`Admission`** request from an outpatient or
emergency encounter:

```prisma
model Admission {
  id                   String          @id @default(uuid())
  sourceEncounterId    String                         // the OPD/ED encounter that decided it
  inpatientEncounterId String?         @unique         // set when the patient is admitted (§13.4)
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

  encounter            Encounter?      @relation(fields: [inpatientEncounterId], references: [id])
}

enum AdmissionStatus {
  REQUESTED           // waiting for deposit / pre-auth / bed
  AWAITING_BED
  ADMITTED
  CANCELLED           // patient declined, condition changed, transferred elsewhere
}
```

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
1. An `INPATIENT` encounter opens, with `parentEncounterId = sourceEncounterId`, coverage carried
   over, and `attendingStaffId` set to the consultant.
2. A `BedAssignment(ADMISSION)` is created and the bed becomes `OCCUPIED`.
3. The admission becomes `ADMITTED` and the source encounter gets `disposition = ADMITTED`.
4. The `ADMISSION_CLERKING` consultation is due: shown on the ward's worklist until it's signed.

### 13.5 Transfers within the hospital

A ward-to-ward or bed-to-bed move ends the open `BedAssignment` and starts a new one
(`TRANSFER`, `UPGRADE`, `ISOLATION`). The old bed goes to `CLEANING`. Responsibility can move to
another consultant too (`attendingStaffId` changes, audited). It's the same encounter throughout.

### 13.6 The stay

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
| 4 | **Physical discharge** | Ward nurse (`discharge.complete`) | `dischargedAt`; `BedAssignment` ended; bed → `CLEANING`; encounter `DISCHARGED` → `CLOSED` once clearance is done |

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

## 14. Disposition and Closing Encounters

### 14.1 Recording a disposition

Requires `encounter.disposition` (doctors). Recording a disposition:
- completes or cancels every open `QueueEntry` of the encounter (except those still needed: the
  cashier and the pharmacy for take-home drugs)
- sets `DISCHARGED`, except for `ADMITTED` (the admission flow continues, §13) and `DIED`
- requires a note for `LEFT_AGAINST_ADVICE`, `ABSCONDED`, `TRANSFERRED_OUT`, `REFERRED_OUT`

### 14.2 Automatic dispositions (end of day job)

- **Outpatient encounters never seen by a clinician**, all of whose entries ended `NO_SHOW` or are
  still waiting at close of clinic: `LEFT_WITHOUT_BEING_SEEN`. The unpaid consultation fee is
  reversed under §11.3's rule.
- **`SERVICE_ONLY` encounters** whose orders are all fulfilled: `SERVICE_COMPLETED`.

### 14.3 Closing **[Q 3]**

An encounter is **closed** when no more charges can post to it. Recommended rules:
- **Outpatient / emergency:** auto-close at the end of the day after disposition, *unless* it has
  unfulfilled orders. Lab results may legitimately arrive tomorrow, and their *results* attach to
  the order whether the encounter is open or not. Only new *charges* are blocked.
- **Inpatient:** closes at physical discharge, once billing clearance is recorded.
- **Reopening** a closed encounter (a charge was missed) needs `encounter.reopen`, a reason, and
  is audited. The missed charge is then posted normally.

## 15. Referrals and Follow-up

### 15.1 Internal referral (same hospital)

A doctor refers the patient to another department or a named clinician *within the same
encounter*:
- a `QueueEntry` in the receiving clinic's queue (`assignedStaffId` if a named clinician,
  `sourceType = REFERRAL`)
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

A patient who walks in only for a lab test, a scan or a pharmacy purchase (`01` §3.6, §3.7, §5)
gets a `SERVICE_ONLY` encounter. There's no consultation, triage or doctor queue. Reception records
the request (with an external prescription or referral as an attachment when there is one), the
orders are created with `orderedBy` = the receptionist and `externalRequester` = the outside
doctor, and the patient goes straight to the cashier and then the service queue.

Standalone **Lab** and **Pharmacy** businesses (`01` §4–5) use only this encounter class.

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
- Every queue gets `shortCode`, `paymentGate` and `noShowAfterCalls` (§5.4, §6)

### 18.2 Permissions

| Key | Grants | Typical holder |
|---|---|---|
| `encounter.create` *(exists)* | Open an encounter / check in | Reception, emergency nurse |
| `encounter.cancel` | Cancel an encounter opened in error | Reception supervisor |
| `encounter.disposition` | Record a disposition | Doctor |
| `encounter.reopen` | Reopen a closed encounter | Billing supervisor, records |
| `queue.view`, `queue.manage` *(exist)* | See / reorder, re-prioritise, re-queue | — |
| `queue.call` | Call, start and complete entries in one's queues | Every station's staff |
| `queue.payment.override` | Release a payment-held entry / waive an admission deposit | Consultant, emergency lead, supervisor |
| `triage.record` | Triage assessment | Nurse |
| `vitals.record` *(exists)* | Vitals | Nurse |
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
| `/encounters` | POST | `encounter.create` | Check in / open an encounter (with the first queue entry) |
| `/appointments/:id/check-in` | POST | `encounter.create` | Check in a booking: creates the encounter |
| `/encounters/:id` | GET | access rule (`05` §7) | Encounter with its entries, triage, consultations, orders, charges |
| `/encounters/:id/cancel` | POST | `encounter.cancel` | Opened in error |
| `/encounters/:id/disposition` | POST | `encounter.disposition` | Record the disposition |
| `/encounters/:id/reopen` | POST | `encounter.reopen` | With reason |
| `/patients/:id/encounters` | GET | `patient.view` | Encounter history (the timeline `06` §6 aggregates) |
| `/queues/:id/entries` | GET | queue membership | Live worklist (ordered, §5.2) |
| `/queues/:id/call-next` | POST | `queue.call` | Atomic call (§5.3) |
| `/queue-entries/:id/{call,start,complete,no-show}` | POST | `queue.call` | Entry transitions |
| `/queue-entries/:id/route` | POST | `queue.call` | Send to the next queue (§5.7) |
| `/queue-entries/:id/priority` | PATCH | `queue.manage` | Raise / lower, with reason |
| `/queue-entries/:id/release-hold` | POST | `queue.payment.override` | Override the payment gate, with reason |
| `/encounters/:id/triage` | POST | `triage.record` | Triage / re-triage |
| `/encounters/:id/vitals` | POST | `vitals.record` | Vitals |
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
| **Q1** | Make `Encounter` the anchor for all care, demoting `Appointment` to "a booking that creates an encounter at check-in"? This revises `07` and `08`. | **Yes.** Nothing else covers emergency, inpatient and service-only visits. |
| **Q2** | Emergency → admission: one encounter that changes class, or two linked encounters? | **Two, linked** (`parentEncounterId`). Payers and reports treat the emergency visit and the stay differently, and the boarding time stays measurable. |
| **Q3** | When does an outpatient encounter close? What about results that arrive tomorrow? | **Auto-close at end of day** after disposition, unless orders are unfulfilled. Results attach to orders, not the open encounter. Reopening is audited. |
| **Q4** | Which queues gate on payment? Admission deposit amounts? Does time spent unpaid count as time in the queue? | Gates as in §6. **Never** in emergency. Deposit per ward type / bed class. `readyAt` resets on release, so paid patients aren't pushed behind people who were holding. |
| **Q5** | Price catalog: build a minimal one now (consultation fees by clinic × clinician grade × first/follow-up, bed rates, review window), or as its own PRD first? | **Its own PRD (12), before building this.** Every module here needs prices, and they'd otherwise be invented piecemeal. |
| **Q6** | Charge orders when placed or when fulfilled? Must cancelling an unpaid, undelivered order need a second approver? | **Charge when placed.** **Auto-void on cancellation if unpaid and undelivered**: a narrow exception to `10` D12, attributed and reasoned. |
| **Q7** | Bed-day rule (midnight census?). May discharge be blocked by an unpaid bill? | **Midnight census** (§13.7). **Billing clearance is recorded but never physically blocks discharge.** The debt stays on the account, with a documented arrangement. Detaining patients over bills is something the system shouldn't facilitate. |
| **Q8** | Emergency triage scale? | **SATS** by default, configurable. |
| **Q9** | Unidentified patients: who merges a temporary record with an existing one, and is patient merge in scope now? | Quick registration now. **Patient merge is its own feature**: it rewrites history across every table and needs its own approval and audit design. |
| **Q10** | Can a patient wait in two queues at once (lab and pharmacy)? How do booked appointments interleave with walk-ins? | **Yes,** with automatic "with another station" holds (§5.6). Bookings ordered by slot time with a grace window. |
| **Q11** | Wards are tenant-defined but queues are system-seeded. How do staff get inpatient access? | **`DutyProfileWard`**, alongside `DutyProfileQueue`, with ward worklists derived from bed assignments. |
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
- **Why one active call per encounter is a database rule.** Two stations calling the same patient
  at once is the commonest real-world queue failure. The database preventing it is cheaper than
  every client trying to.
- **Why the payment gate is per queue, not per hospital.** Real hospitals gate the doctor and the
  lab but not triage, and never the emergency department. One global switch can't express that.
- **Why emergency → admission is two encounters.** They have different payers' rules, different
  KPIs and different responsible clinicians. Linking keeps the continuity without merging the
  accounting.
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
| `04` `Queue` | `shortCode`, `paymentGate`, `noShowAfterCalls`; new Procedure Room and Bed Management queues |
| `05` | `DutyProfileWard`; the access rule's "in queue Q" is a `QueueEntry` |
| `06` `Patient` | `isUnidentified`; quick-registration path |
| `10` | `Charge.encounterId`, `Encounter.coverageId`, admission pre-auth, the D12 exception |
| Schema | `ConsultationType` model (currently just a name) is superseded by the price catalog (PRD 12) |
| Permissions catalog | §18.2 |
