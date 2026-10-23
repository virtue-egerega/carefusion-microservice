# Feature PRD — Consultations

Status: Draft — the note (§3–§9) agreed, allergies and orders next to design · Last updated: 2026-10-23
Depends on: `11-encounters-and-patient-journey.md` (`Encounter`, `QueueEntry`, triage and vitals
§8–9), `06-patient-management.md` (`Patient`, age groups), `05-access-control-clinical-scoping.md`
(duty profiles and permissions).
Replaces: `08` §2 (`Consultation`, `Diagnosis`) and `11` §10.1–10.3. `08` §4 (`ClinicalNote`) is
replaced for consultations by addenda (§7); nursing notes stay with the Nursing PRD.

This document defines the doctor's consultation note: what it records, how it's stored, and how it
is written, signed and corrected. It's a general note for every hospital and clinic; specialty
templates come later (§10).

## 1. Decisions Record

| # | Decision | § |
|---|---|---|
| D1 | **Consultations are a top-level module** (`src/consultations/`), like triage. | 2 |
| D2 | **A consultation belongs to an encounter**; an encounter can have several (each clinic seen, a result review, every ward round). At most one per doctor's task. | 2 |
| D3 | **Structure what the system acts on or a later visit needs; the rest is text.** Doctors don't fill forms field by field. | 3 |
| D4 | **Presenting complaints are a list** of complaint + duration, the first pre-filled from triage. | 3.1 |
| D5 | **Past medical history is the patient's diagnoses**, shown by the UI across visits. A condition diagnosed elsewhere is recorded as a **reported** diagnosis. There's no separate history table. | 3.4, 5 |
| D6 | **Drug history carries this visit's medication adherence**, because it changes every visit and chronic clinics report on it. | 3.5 |
| D7 | **Children's and women's sections apply by age and sex**, not to everyone. | 3.8 |
| D8 | **General examination is a checklist of signs; systemic examination is text per body system.** Refined as we go. | 4 |
| D9 | **Diagnoses are coded in ICD-10**, the standard used by NHIA and HMO claims. The code system is stored per diagnosis so ICD-11 can follow. | 5 |
| D10 | **Signing locks the note; corrections are addenda.** | 7 |
| D11 | **No consultation fee here.** Charging for consultations is left out entirely for now. | 11 |
| D12 | **Allergies and orders** (investigations, prescriptions, procedures) **are designed next**, in their own sections. | 10 |

## 2. The Consultation

```prisma
model Consultation {
  id                   String             @id @default(uuid())
  organizationId       String
  encounterId          String
  patientId            String
  queueEntryId         String?            @unique   // the doctor's task it was written in; null for a ward round
  clinicId             String?                      // the encounter's clinic when started
  doctorId             String                       // the author: only they edit the draft
  type                 ConsultationKind   @default(INITIAL)
  status               ConsultationStatus @default(DRAFT)

  // §3 history
  presentingHistory    String?                      // history of presenting complaint (HPC)
  pastSurgicalHistory  String?
  currentMedications   String?                      // drug history: what they take, including herbal / OTC
  adherence            MedicationAdherence?
  adherenceNote        String?                      // why: "can't afford", "side effects", "forgets"
  socialHistory        String?
  smoking              SmokingStatus?
  alcohol              AlcoholUse?
  familyHistory        String?

  // §3.8 children
  birthHistory         String?
  immunisationHistory  String?
  developmentHistory   String?
  feedingHistory       String?

  // §3.8 women of reproductive age
  lastMenstrualPeriod  DateTime?          @db.Date
  gravida              Int?
  parity               Int?                         // births after 28 weeks: the "P2" of "G3P2+1"
  abortions            Int?                         // losses before 28 weeks: the "+1"
  contraception        String?

  // §4, §6
  generalExamNote      String?                      // anything on general examination not in the checklist
  summary              String?                      // one or two lines: what the next doctor reads first
  impression           String?                      // the clinical reasoning behind the diagnoses
  advice               String?                      // counselling and warning signs, printable for the patient
  planNotes            String?
  followUpOn           DateTime?          @db.Date
  outcome              ConsultationOutcome?
  outcomeNote          String?

  startedAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt
  signedAt             DateTime?

  encounter            Encounter          @relation(fields: [encounterId], references: [id], onDelete: Cascade)
  patient              Patient            @relation(fields: [patientId], references: [id], onDelete: Cascade)
  complaints           ConsultationComplaint[]
  systemReviews        ConsultationSystemReview[]
  generalSigns         ConsultationGeneralSign[]
  examinations         ConsultationExamination[]
  diagnoses            Diagnosis[]
  addenda              ConsultationAddendum[]

  @@index([encounterId])
  @@index([patientId, startedAt])
  @@index([organizationId, doctorId, status])
}

enum ConsultationKind   { INITIAL FOLLOW_UP RESULT_REVIEW REFERRAL EMERGENCY WARD_ROUND ADMISSION_CLERKING PRE_OPERATIVE }
enum ConsultationStatus { DRAFT SIGNED }
```

- **Starting one.** The doctor starts a consultation on an open encounter, usually from the task
  they're serving (`queueEntryId`, which must be the encounter's and `IN_SERVICE`). A ward round has
  no task. The same doctor seeing the patient again later in the encounter starts a new note.
- **It shows triage, it doesn't copy it.** The latest triage assessment and vitals are returned with
  the note. Only the first presenting complaint is pre-filled (§3.1), because the doctor edits it.
- **The encounter learns from it.** The first consultation sets `Encounter.attendingStaffId` if it
  isn't set, so encounter lists show the doctor. If nobody triaged, the first complaint becomes
  `Encounter.reasonForVisit`.
- **Only the author edits the draft**, a section at a time (autosave). A draft the author no longer
  wants can be discarded while it's a draft; a signed note can't be removed.

## 3. History

### 3.1 Presenting complaints

What the patient came with, in their words, each with how long: "Fever × 3/7, vomiting × 1/7".

```prisma
model ConsultationComplaint {
  id             String  @id @default(uuid())
  consultationId String
  complaint      String
  duration       String?                        // free text: "3 days", "since childhood"
  position       Int                            // the order the doctor listed them

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  @@unique([consultationId, position])
}
```

A new consultation's first complaint is the triage presenting complaint, if there is one. Reports
("top presenting complaints") and searching the record use the list.

### 3.2 History of presenting complaint

`presentingHistory`, free text: onset, character, timing, what makes it better or worse, what was
taken before coming, relevant negatives. For pain the screen prompts SOCRATES; it's still one text.

### 3.3 Review of systems

Asking about each body system for symptoms not already mentioned. One row per system reviewed:

```prisma
model ConsultationSystemReview {
  id             String     @id @default(uuid())
  consultationId String
  system         BodySystem
  normal         Boolean    @default(false)     // "nothing to note"
  findings       String?

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  @@unique([consultationId, system])
}

enum BodySystem {
  CONSTITUTIONAL        // fever, weight loss, night sweats, fatigue (review of systems)
  CARDIOVASCULAR
  RESPIRATORY
  GASTROINTESTINAL      // abdomen on examination
  GENITOURINARY
  NEUROLOGICAL
  MUSCULOSKELETAL
  SKIN
  ENT
  EYES
  BREAST
  ENDOCRINE
  PSYCHIATRIC
  OTHER
}
```

A row is either ticked normal or has findings. The same systems serve the examination (§4.2).

### 3.4 Past medical and surgical history

- **Past medical history is the patient's diagnoses** (§5) from earlier visits; the UI shows them.
  A condition diagnosed elsewhere ("known hypertensive for 5 years, diagnosed at another hospital")
  is recorded in this consultation as a **reported** diagnosis, so the patient's list of diagnoses is
  their past medical history, in one query.
- **Past surgical history** is `pastSurgicalHistory`, text: operations, year, where.

### 3.5 Drug history and adherence

- `currentMedications`, text: what the patient takes, including herbal and over-the-counter.
- `adherence` for this visit, with `adherenceNote`:

```prisma
enum MedicationAdherence { GOOD PARTIAL POOR NOT_APPLICABLE }
```

It's per visit because it changes from visit to visit, and the hypertension, diabetes and HIV
clinics report on it. `NOT_APPLICABLE` is for a patient on no regular medication.

### 3.6 Social history

`socialHistory`, text (living conditions, travel, support at home), plus two optional fields:

```prisma
enum SmokingStatus { NEVER FORMER CURRENT }
enum AlcoholUse    { NONE OCCASIONAL REGULAR HEAVY }
```

Occupation and marital status are already on `Patient` and are shown, not retyped.

### 3.7 Family history

`familyHistory`, text: hypertension, diabetes, sickle cell, cancer, and in whom. It isn't the
patient's diagnosis, so it isn't coded.

### 3.8 Children's and women's sections

Shown and accepted only when they apply, worked out from the patient at the encounter:

| Section | Fields | Applies when |
|---|---|---|
| **Children** | `birthHistory`, `immunisationHistory`, `developmentHistory`, `feedingHistory` | The encounter's age group is `NEONATE`, `INFANT`, `UNDER_FIVE`, `CHILD` or `ADOLESCENT` |
| **Women** | `lastMenstrualPeriod`, `gravida`, `parity`, `abortions`, `contraception` | The patient is `FEMALE` and the age group is `ADOLESCENT` or `ADULT` |

When the age or sex isn't known, both apply. Saving a section that doesn't apply is refused (400).
The note returns `sections: { children, women }` so the frontend shows the right ones. A last
menstrual period can't be in the future, and `parity + abortions` can't exceed `gravida` once a
pregnancy is counted (`gravida ≥ parity + abortions`).

## 4. Examination

### 4.1 General examination

The signs documented in nearly every note ("not pale, anicteric, acyanosed, no finger clubbing, no
peripheral lymphadenopathy, no pedal oedema, well hydrated"), as a checklist:

```prisma
model ConsultationGeneralSign {
  id             String      @id @default(uuid())
  consultationId String
  sign           GeneralSign
  present        Boolean                         // false = documented absent
  grade          Int?                            // 1–3 (+ to +++) where the sign is graded
  note           String?                         // "pitting to mid-shin", "moderate"

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  @@unique([consultationId, sign])
}

enum GeneralSign { PALLOR JAUNDICE CYANOSIS CLUBBING LYMPHADENOPATHY OEDEMA DEHYDRATION }
```

A sign not in the list wasn't examined; one in the list was found present or absent. Anything else
on general examination goes in `generalExamNote`. A grade is only accepted on a present sign.

**Vitals** are shown from the encounter's latest reading, not copied. The doctor can take a new
reading through the vitals endpoint (`11` §9) with `context = OBSERVATION`.

### 4.2 Systemic examination

One row per system examined, normal or with findings:

```prisma
model ConsultationExamination {
  id             String     @id @default(uuid())
  consultationId String
  system         BodySystem
  normal         Boolean    @default(false)
  findings       String?

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  @@unique([consultationId, system])
}
```

The findings are text. The screen prompts what each system covers (cardiovascular: pulse, apex
beat, heart sounds, murmurs; respiratory: expansion, percussion, breath sounds; abdomen: tenderness,
liver, spleen, bowel sounds; neurological: consciousness, cranial nerves, power, tone, reflexes);
the prompts aren't fields. An intimate examination (breast, PV, PR) records the chaperone in its
findings.

## 5. Diagnoses

```prisma
model Diagnosis {
  id             String              @id @default(uuid())
  consultationId String
  encounterId    String                            // so encounters and claims list them directly
  patientId      String                            // so past medical history is one query (§3.4)
  codeSystem     DiagnosisCodeSystem @default(ICD_10)
  code           String                            // "B54"
  description    String                            // copied from the code list at the time
  isPrimary      Boolean             @default(false)
  certainty      DiagnosisCertainty
  reported       Boolean             @default(false) // diagnosed elsewhere, from the history (§3.4)
  note           String?
  recordedBy     String
  recordedAt     DateTime            @default(now())

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)

  @@unique([consultationId, codeSystem, code])
  @@index([patientId, recordedAt])
  @@index([encounterId])
}

enum DiagnosisCodeSystem { ICD_10 ICD_11 }
enum DiagnosisCertainty  { PROVISIONAL DIFFERENTIAL CONFIRMED RULED_OUT }

model DiagnosisCode {                 // the ICD-10 list, shared by every hospital
  codeSystem  DiagnosisCodeSystem
  code        String                  // "B54", "I10", "E11.9"
  title       String
  chapter     String?
  isActive    Boolean @default(true)  // retired codes stay for old diagnoses

  @@id([codeSystem, code])
}
```

- **Working diagnosis**: at most **one primary** per consultation (a partial unique index, written
  in SQL since Prisma can't express it). The primary can't be a differential, ruled out, or reported.
- **Differentials**: further diagnoses with `certainty = DIFFERENTIAL`.
- **Reported**: `reported = true`, from the history; `CONFIRMED` or `PROVISIONAL` only.
- **The description is copied**, so a code-list update never rewrites a past diagnosis. Only active
  codes can be chosen; the code list is searched by code or title.
- **Results change certainty later without editing the signed note.** A result-review consultation
  records the diagnosis again, `CONFIRMED` or `RULED_OUT`. The patient's list shows each condition's
  latest certainty.
- **The code list** is seeded once for all hospitals from a WHO ICD-10 file (**[Q 1]**: the source
  file and its licence).

## 6. Plan and Outcome

### 6.1 Plan

| Part | Stored as |
|---|---|
| Investigations, prescriptions, procedures | Orders, designed next (§10) |
| Advice and counselling | `advice`, text, printable for the patient |
| Follow-up | `followUpOn`, a date. Booking the appointment from it comes later |
| Anything else | `planNotes`, text |

### 6.2 Outcome

How this consultation ends. It isn't the encounter's disposition (`11` §14): one encounter can hold
several consultations.

```prisma
enum ConsultationOutcome {
  SENT_HOME             // treated; leaves once any orders (pharmacy, lab) are done
  AWAITING_RESULTS      // returns to this doctor after investigations, same encounter (RESULT_REVIEW)
  FOLLOW_UP             // home now, back on followUpOn as a new encounter
  REFERRED_INTERNAL     // sent to another clinic in this encounter
  REFERRED_OUT          // to another facility
  ADMIT                 // an admission request (11 §13.2)
  LEFT_AGAINST_ADVICE
  DIED
}
```

In v1 the outcome is **recorded**: moving the patient is still completing the doctor's task with
the next queue (`11` §5.7). What each outcome sets off (the admission request, the referral
letter, booking the follow-up, the encounter's disposition) is designed with orders and referrals.
`FOLLOW_UP` needs `followUpOn`.

## 7. Signing and Addenda

- **Signing** (`POST /consultations/:id/sign`, by the author) needs at least one complaint, a
  primary diagnosis and an outcome. It sets `SIGNED` and `signedAt`, and locks the note with its
  complaints, reviews, signs, examinations and diagnoses.
- **After signing**, corrections and late findings are addenda, shown under the note in order:

```prisma
model ConsultationAddendum {
  id             String   @id @default(uuid())
  consultationId String
  text           String
  addedBy        String
  addedAt        DateTime @default(now())

  consultation   Consultation @relation(fields: [consultationId], references: [id], onDelete: Cascade)
}
```

Any clinician with `consultation.create` can add one; it's attributed to them. Addenda are only for
signed notes; a draft is simply edited. Co-signature of trainees' notes comes later (`11` **[Q 13]**).

## 8. Permissions

| Key | Allows |
|---|---|
| `consultation.view` *(new)* | Read consultations and a patient's diagnoses |
| `consultation.create` *(exists)* | Start a consultation, edit and discard one's own draft, record its diagnoses, sign it, add addenda |

`diagnosis.create` is retired into `consultation.create`: a diagnosis is only recorded in a
consultation. Its holders carry over. Every action is scoped to the caller's organisation.

## 9. APIs

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/encounters/:id/consultations` | POST | `consultation.create` | Start a consultation: `{ type?, queueEntryId? }`; `{ id, message }` |
| `/encounters/:id/consultations` | GET | `consultation.view` | `{ count, docs }`; filters `status`, `type`, `doctorId`; `limit` / `offset` |
| `/patients/:id/consultations` | GET | `consultation.view` | `{ count, docs }`, newest first; filters `status`, `type`, `clinicId`, `doctorId`, `from` / `to`, `search` (complaints, diagnoses) |
| `/consultations/:id` | GET | `consultation.view` | The note with its complaints, reviews, signs, examinations, diagnoses and addenda, the encounter's triage and latest vitals, and `sections` (§3.8) |
| `/consultations/:id` | PATCH | `consultation.create` | Save any sections of one's own draft. `complaints`, `systemReviews`, `generalSigns` and `examinations` are sent as whole lists and replace the saved ones; `{ message }` |
| `/consultations/:id` | DELETE | `consultation.create` | Discard one's own draft |
| `/consultations/:id/diagnoses` | POST | `consultation.create` | Add a diagnosis to one's own draft; `{ id, message }` |
| `/consultations/:id/diagnoses/:diagnosisId` | PATCH / DELETE | `consultation.create` | Change or remove one, in a draft only |
| `/consultations/:id/sign` | POST | `consultation.create` | Sign one's own draft (§7) |
| `/consultations/:id/addenda` | POST | `consultation.create` | Add an addendum to a signed note |
| `/patients/:id/diagnoses` | GET | `consultation.view` | Past medical history: `{ count, docs }`, each condition with its latest certainty; filters `certainty`, `reported`, `search` |
| `/diagnosis-codes` | GET | any staff | Search the code list: `{ count, docs }`; `search` (code or title), `codeSystem` |

Enums the forms need (`BodySystem`, `GeneralSign`, `MedicationAdherence`, `SmokingStatus`,
`AlcoholUse`, `DiagnosisCertainty`, `ConsultationKind`, `ConsultationOutcome`) are served by
`GET /enums` under `consultation`.

## 10. Next to Design

- **Allergies.** What's recorded (allergen, kind, reaction, severity), "no known allergies" as an
  explicit answer rather than a blank, keeping them on the patient across visits, a banner on every
  clinical screen, and checking prescriptions against them.
- **Orders.** Investigations (lab, imaging), prescriptions and procedures: each points at a billable
  item, attaches to the consultation and encounter, posts a charge and creates the next station's
  task (`11` §11). Prescriptions need dosing (dose, route, frequency, duration, quantity) and decide
  whether drugs need a drug list beyond billable items.
- **What outcomes set off** (§6.2) and referrals.
- **Specialty templates**: antenatal, dental, eye (`11` **[Q 15]**).
- **Co-signature** of trainees' notes (`11` **[Q 13]**).

## 11. Out of Scope

- **Consultation fees**, including a second clinic in the same encounter and one fee covering a
  visit. Left out entirely for now.
- **Voice dictation and attachments** on the note.
- **Nursing notes** (the Nursing PRD).

## 12. Open Decisions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Which ICD-10 file seeds the code list, and under what licence? | WHO ICD-10 (not the US ICD-10-CM), as used by NHIA. Hospitals don't edit the list |
