# Feature PRD — Appointment Management

Status: Draft · Last updated: 2026-07-05
Depends on: `02-hospital-onboarding.md` (`Branch`), `04-departments.md` (`Department`, `Queue`),
`05-access-control-clinical-scoping.md` (`DutyProfile`, `PatientAssignment`),
`06-patient-management.md` (`Patient`).
Referenced by: `08-electronic-medical-records.md` (a `Consultation` hangs off an `Appointment`).

## 1. What Problem This Solves

An `Appointment` is the durable record of one patient's visit — who, with which doctor, at which
branch, in which queue — regardless of whether it was booked online weeks ahead or created at the
front desk five minutes ago. `Queue` (`04`) already answers "who's next, right now"; this document
answers the broader questions around that moment: was there a slot for this, which room is it in,
does anyone get reminded, what happens when it's moved or missed.

`Appointment` is scoped to a `Branch` — the same branch the patient is visible at (their home
branch, or one they've been shared to per `06` §5). This is a physical booking against a specific
branch's doctor and room; there's no meaningful "org-wide" appointment.

## 2. Data Model

### 2.1 `DoctorSchedule` and `DoctorScheduleException` (availability)

```prisma
model DoctorSchedule {
  id                 String   @id @default(uuid())
  staffId            String
  branchId           String
  departmentId       String
  queueId            String
  dayOfWeek          Weekday
  startTime          String                       // "09:00"
  endTime            String                       // "17:00"
  slotDurationMinutes Int     @default(15)
  isActive           Boolean  @default(true)

  staff              Staff      @relation(fields: [staffId], references: [id], onDelete: Cascade)
  branch             Branch     @relation(fields: [branchId], references: [id], onDelete: Cascade)
  department         Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  queue              Queue      @relation(fields: [queueId], references: [id], onDelete: Cascade)

  @@index([staffId, dayOfWeek])
}

enum Weekday {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

model DoctorScheduleException {
  id        String   @id @default(uuid())
  staffId   String
  date      DateTime
  type      ExceptionType
  startTime String?                                // only for EXTRA_SLOT
  endTime   String?
  note      String?

  staff     Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([staffId, date])
}

enum ExceptionType {
  UNAVAILABLE                                       // leave, holiday — cancels the template for that date
  EXTRA_SLOT                                        // one-off additional availability
}
```

A recurring weekly template (`DoctorSchedule`) plus date-specific exceptions, not pre-generated
slot rows for a year — available slots are computed on demand (template minus exceptions minus
existing bookings) rather than materialized in advance for every doctor, every day.

### 2.2 `Room`

```prisma
model Room {
  id           String    @id @default(uuid())
  branchId     String
  departmentId String?
  name         String
  code         String
  isActive     Boolean   @default(true)

  branch       Branch      @relation(fields: [branchId], references: [id], onDelete: Cascade)
  department   Department? @relation(fields: [departmentId], references: [id])

  @@unique([branchId, code])
}
```

A physical space, distinct from `Queue`. `Queue` (`04`) orders *people* ("who's next"); `Room`
is a *resource conflict* ("this space can't hold two consultations at once"). Conflating them
would mean a queue's identity changes depending on which physical room happens to be free that
day.

### 2.3 `Appointment`

```prisma
model Appointment {
  id                String   @id @default(uuid())
  patientId         String
  branchId          String
  departmentId      String
  queueId           String
  doctorId          String                          // Staff.id
  roomId            String?
  scheduledAt       DateTime
  checkedInAt       DateTime?
  startedAt         DateTime?
  endedAt           DateTime?
  status            AppointmentStatus @default(SCHEDULED)
  source            AppointmentSource
  bookedBy          String                          // Staff.id who created it (self, for online booking by a portal user, once that exists)
  referredById      String?                         // Staff.id, if this visit originated from a referral
  reason            String?
  rescheduledFromId String?          @unique        // points at the Appointment this one replaced
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  patient           Patient      @relation(fields: [patientId], references: [id])
  branch            Branch       @relation(fields: [branchId], references: [id])
  department        Department   @relation(fields: [departmentId], references: [id])
  queue             Queue        @relation(fields: [queueId], references: [id])
  doctor            Staff        @relation("AppointmentDoctor", fields: [doctorId], references: [id])
  room              Room?        @relation(fields: [roomId], references: [id])
  rescheduledFrom   Appointment? @relation("AppointmentReschedule", fields: [rescheduledFromId], references: [id])
  reminders         AppointmentReminder[]

  @@index([branchId, scheduledAt])
  @@index([doctorId, scheduledAt])
  @@index([patientId])
}

enum AppointmentStatus {
  SCHEDULED
  CHECKED_IN
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum AppointmentSource {
  ONLINE
  WALK_IN
  PHONE
}
```

One entity for both a scheduled booking and a walk-in — `source` captures how it was created,
`scheduledAt` is "now" for a walk-in rather than a future slot. Everything downstream (`Queue`
entry, `08`'s `Consultation`, reminders) treats both identically once the row exists; forking into
two models would just mean every consumer re-implements the same "which kind is this" branch.

**Rescheduling** creates a new `Appointment` row (`rescheduledFromId` pointing at the old one,
which is set to `CANCELLED`) rather than mutating `scheduledAt` in place — a clean, queryable
history of what moved and from what, with no separate history table needed.

### 2.4 `AppointmentReminder`

```prisma
model AppointmentReminder {
  id            String   @id @default(uuid())
  appointmentId String
  channel       ReminderChannel
  scheduledFor  DateTime
  sentAt        DateTime?
  status        ReminderStatus @default(PENDING)

  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  @@index([appointmentId])
}

enum ReminderChannel {
  SMS
  EMAIL
}

enum ReminderStatus {
  PENDING
  SENT
  FAILED
}
```

Rows created at booking time (e.g. 24 hours and 2 hours before `scheduledAt`); actual delivery is
a background job and a provider integration, out of scope here (§7) — this table only says a
reminder is owed and whether it went out.

### 2.5 `WaitingList`

```prisma
model WaitingList {
  id             String   @id @default(uuid())
  patientId      String
  branchId       String
  departmentId   String
  doctorId       String?
  note           String?
  status         WaitingListStatus @default(WAITING)
  createdAt      DateTime @default(now())

  patient        Patient    @relation(fields: [patientId], references: [id])
  branch         Branch     @relation(fields: [branchId], references: [id])
  department     Department @relation(fields: [departmentId], references: [id])
  doctor         Staff?     @relation(fields: [doctorId], references: [id])

  @@index([branchId, departmentId, status])
}

enum WaitingListStatus {
  WAITING
  OFFERED
  CONVERTED
  EXPIRED
}
```

Distinct from `Queue`: `Queue` is same-day, in-person, ordered flow — it implies the patient is
physically present. `WaitingList` implies the opposite — no slot exists yet, the patient isn't
here, and they're waiting to be offered one (typically on a cancellation). Converting an entry
creates an `Appointment` and flips `status` to `CONVERTED`.

## 3. Booking and Check-In Flow

- **Online/phone booking**: pick a doctor, date, and time from `DoctorSchedule` availability
  (template minus exceptions minus already-booked slots) → `Appointment(source=ONLINE|PHONE,
  status=SCHEDULED)`.
- **Walk-in**: reception creates `Appointment(source=WALK_IN, status=CHECKED_IN, scheduledAt=now)`
  directly — no slot lookup; the patient joins the relevant `Queue` (`04`) immediately, and the
  queue's own ordering (not a time slot) governs when they're seen.
- **Check-in** (for a pre-scheduled appointment): on arrival, `status` moves `SCHEDULED` →
  `CHECKED_IN`, `checkedInAt` is set, and the patient enters the relevant `Queue` at that moment —
  not before. An appointment existing doesn't put someone in the queue; arriving does.
- **Room** is assigned either at booking time (a doctor with a fixed room) or at check-in (shared
  rooms, assigned dynamically) — `roomId` stays nullable until whichever point applies.

## 4. Why / Where / Why Not

- **Why one `Appointment` model for scheduled and walk-in** — see §2.3; the alternative forks
  every downstream consumer into two cases for no benefit once the visit exists.
- **Why `Room` is a separate concept from `Queue`** — see §2.2; a room is a resource-booking
  conflict, a queue is a people-ordering mechanism, and they vary independently (two doctors can
  share one queue's overflow but never one room at the same time).
- **Why `WaitingList` is separate from `Queue`** — presence vs. absence; a queue entry means
  "here now," a waitlist entry means "not yet, tell me when."
- **Why availability is a template + exceptions, not pre-generated slots** — a year of daily slot
  rows per doctor is both enormous and mostly thrown away unbooked; computing on demand avoids
  that without losing anything a pre-generated row would have offered.
- **Why check-in, not booking, is what creates the `Queue` entry** — a scheduled appointment that's
  a no-show shouldn't have ever occupied a live queue position; queue membership should mean
  "physically here," not "has a booking for today."

## 5. Explicitly Out of Scope for v1

- **SMS/Email delivery mechanics** (provider integration, retry policy) — `AppointmentReminder`
  only models that a reminder is owed and its status; sending it is a separate concern.
- **Concurrent-booking race conditions** (two people booking the last slot at once) — flagged as
  an implementation-level concern for whoever builds this, not resolved at the data-model level
  here.
- **Multi-doctor or team appointments** — v1 is one doctor per `Appointment`.
- **Recurring appointment series** (e.g. weekly physiotherapy) — each visit is booked
  individually; no series/template-of-appointments concept in v1.
- **Patient-facing online booking UI/portal** — this document defines the data `source=ONLINE`
  bookings land in; the portal itself is a separate feature.
