# CareFusion — Application Flow

Status: Draft v4 · Last updated: 2026-07-05

Process only — no architecture, no data model. What happens, in what order, for each type of
business CareFusion runs, and the mechanic (queues) that actually moves work between departments.

## 1. Tenant Types

CareFusion is installed per organization, and the organization is one of three business types.
The business type determines which departments are active:

- **Hospital** — runs every department a hospital needs to function: registration, OPD, A&E,
  inpatient/wards, nursing, laboratory, radiology/imaging, theatre/surgery, pharmacy, billing,
  records. All of it is in scope — it gets *built* progressively (core clinical loop first, the
  rest layered on before going to production), but nothing here is a "later" department in the
  design itself.
- **Lab** — standalone diagnostic center: registration, phlebotomy, processing, results, billing.
  No consultations, no wards.
- **Pharmacy** — standalone retail pharmacy: dispensing counter, inventory, billing. No patient
  records beyond a sale, no consultations.

A hospital's internal Lab and Pharmacy departments run the same processes as the standalone Lab
and Pharmacy flows below — they're one department among several rather than the whole business.

## 2. The Core Mechanic: Departments Are Queues

This is the thing to get right before anything else, because it's the backbone of every flow
below, not just the lab's.

- Every department/station (registration, triage, a doctor's room, phlebotomy, cashier,
  dispensing counter, a lab bench) works off its **own queue** — a worklist of who or what is
  waiting for that station specifically.
- Staff at a station pull the next item off **their** queue, do the work, and push the
  patient/order/sample forward into the **next** station's queue. Nothing is "handed" directly
  from one person to another — it moves queue to queue.
- Some queues are patient-facing — the patient is physically present and waiting (triage, a
  doctor's room, phlebotomy, the pharmacy counter). Others are object-facing, once the patient has
  already left — a sample sits in a "pending processing" worklist, a result sits in a "pending
  verification" worklist.
- A "ready" state (results ready, prescription ready) is a queue too, but a **virtual** one — no
  one is standing in a physical line for it. It's a worklist state that triggers a notification and
  lets the next actor (doctor, patient, front desk) pull the item, rather than the person waiting
  in line for it.
- Priority overrides order — an emergency case or a doctor's stat order jumps ahead in whichever
  queue it enters.
- A single visit can be in more than one queue's history over time but only needs to be in **one
  queue at a time** from the patient's point of view (except where two tracks genuinely run in
  parallel — e.g. a lab order and a pharmacy order placed from the same consultation move through
  their own queues independently and simply both report back to the consultation when done).
- **A department is often itself a chain of sub-queues, not one queue.** "Lab" isn't a single
  station — sample collection, processing, and verification are three separate worklists chained
  together. "Nursing" isn't a single station either — vitals and injections/procedures are
  separate queues a patient can be routed through independently. Every department section below
  names its actual sub-queues rather than treating the department as one block.

Every flow section below is written as a chain of queues, not as prose handoffs.

---

## 3. Hospital Flow

### 3.1 Onboarding
1. Org + branch(es) set up.
2. Departments activated for this hospital (registration, OPD, A&E, wards, nursing, laboratory,
   radiology, theatre, pharmacy, billing, records).
3. Staff onboarded per department, roles assigned.
4. Reference data entered: consultation/clinic types, drug catalog + opening stock, lab test
   catalog + pricing, imaging/procedure catalog + pricing, theatre procedure list, insurance
   schemes accepted, ward/bed list.

### 3.2 Outpatient (OPD)
1. **Registration queue** — patient checks in (walk-in, referred, or recognized via NFC if
   already registered).
2. **Cashier queue** — registration/consultation fee billed and paid.
3. **Triage queue** — nurse calls the patient, captures vitals/weight/chief complaint, pushes to
   the doctor queue.
4. **Doctor queue** — doctor calls the patient, consults.
5. Doctor decides next step, which may fork the patient into one or more independent queues:
   - **Lab queue** (§3.6) if tests are ordered
   - **Radiology queue** (§3.7) if imaging is ordered
   - **Pharmacy queue** (§3.5) if drugs are prescribed
   - **Theatre booking** (§3.8) if a procedure/surgery is needed
   - **Admission** (§3.3) if the patient needs to be admitted
   - Referral to another doctor's queue
6. Each forked queue runs to completion on its own and reports back (result ready, drugs
   dispensed, procedure done) — the doctor or the patient picks it back up rather than the visit
   blocking on it.
7. **Cashier queue** (again) — any remaining charges from the visit are billed; patient pays or
   it's routed to insurance.
8. Visit closes.

Specialty clinics (dental, eye, ENT, physiotherapy, antenatal) run this exact same queue chain —
registration → cashier → triage (where relevant) → doctor/specialist queue — just with a
specialist's queue instead of a general doctor's, and their own reference/procedure catalog.

### 3.3 Inpatient (Admission)
1. Admission decided from an OPD consultation (3.2), on A&E arrival, or post-procedure from
   Theatre (3.8).
2. **Ward/bed assignment queue** — bed manager or admitting nurse assigns a bed (general,
   maternity/labor, pediatric, or ICU/HDU — same assignment mechanic, different ward pool; ICU/HDU
   just carries continuous monitoring instead of scheduled rounds).
3. Ongoing nursing work for the stay runs off its own recurring worklists, not one-time queue
   entries — see §3.4.
4. **Ward round queue** — doctor works through today's admitted patients on this ward, reviews
   each, updates orders.
5. Lab (§3.6), Radiology (§3.7), and Pharmacy (§3.5) queues continue to be entered/exited for
   orders raised during the stay, same as outpatient.
6. Doctor marks the patient for discharge; discharge summary written.
7. **Cashier queue** — final bill (bed/ward charges + everything accumulated during the stay)
   billed and settled, directly or via insurance.
8. Patient discharged, bed freed.

### 3.4 Nursing
Nursing doesn't have one patient journey — it runs several of its own sub-queues, entered from
either OPD or the ward depending on context:

- **Vital signs queue** — OPD triage (3.2) before the doctor, and scheduled rounds on the ward.
- **Injection/procedure room queue** — patient is routed here after a doctor orders an injection,
  dressing change, wound care, or other minor procedure; separate from the vitals queue, and a
  patient can be in both over the course of one visit.
- **Medication administration round** (inpatient) — a per-ward, per-shift worklist of due doses
  across all admitted patients, not a queue a single patient enters — the nurse works the ward,
  not the other way around.
- **Observation/monitoring queue** — post-procedure or A&E patients held for monitoring before
  being routed onward (to a ward, to discharge, or to theatre).

### 3.5 Pharmacy (hospital department)
1. **Prescription queue** — order arrives from an OPD or inpatient consultation.
2. Pharmacist/technician pulls it, checks stock.
3. **Cashier queue** — billed to the outpatient visit or accrued to the inpatient ward bill.
4. **Dispensing queue** — once paid (or ward-billed), the prescription enters this queue;
   pharmacist calls it, verifies, dispenses; stock decremented.
5. Separately, retail walk-in sale runs its own short chain with no consultation attached:
   **counter queue → cashier → dispensing**, same as the standalone Pharmacy flow (§5).
6. When stock runs low: reorder raised to a supplier, stock received and quantities updated —
   this runs on its own schedule, not tied to any patient queue.

### 3.6 Laboratory (hospital department)
1. **Reception/registration queue** — order arrives from a consultation, or a walk-in requests a
   test directly with no consultation.
2. **Cashier queue** — test(s) billed; paid directly (outpatient/walk-in) or accrued to the ward
   bill (inpatient).
3. **Sample collection queue** — patient is physically waiting here (this covers blood draws via
   a phlebotomist, as well as urine/stool/swab drop-off). Staff call the patient from their own
   queue (separate from reception's), verify identity and the test order, collect the sample(s),
   label them. Patient is released — they don't wait for the result.
4. **Result-pending queue** — sample-level now, no patient attached. Lab techs pull samples off
   this worklist and run the test(s). (Larger labs split this by bench — hematology, chemistry,
   microbiology — but it's the same mechanic: an object-level worklist per bench.)
5. **Verification queue** — a senior tech/lab admin pulls completed results off this list,
   reviews, signs off.
6. **Results-ready queue** (virtual) — verified result lands here; triggers a notification. The
   ordering doctor and the patient can now pull it. If it came from a consultation, the doctor
   reviews it and decides the next step (more tests, a prescription, or closing the visit).

Blood bank, where offered, is a specialized extension of this same chain: a ward/theatre request
enters a **cross-matching queue** instead of general processing, then an **issue queue** once
matched, releasing blood units to the requesting ward.

### 3.7 Radiology / Imaging (hospital department)
1. **Order queue** — imaging request arrives from a consultation, A&E, or a ward round; or a
   walk-in referral from an outside doctor.
2. **Cashier queue** — billed and paid directly, or accrued to the ward bill (inpatient).
3. **Imaging queue** — patient is physically waiting here. Radiographer calls the patient,
   performs the scan/X-ray/ultrasound/CT/MRI. Patient is released.
4. **Reporting queue** — object-level worklist, no patient attached. Radiologist pulls completed
   images, reads them, writes the report.
5. **Results-ready queue** (virtual) — report lands here, triggers a notification; ordering
   doctor and patient can pull it.

### 3.8 Theatre / Surgery (hospital department)
1. **Booking queue** — doctor lists the patient for a procedure; scheduled against available
   theatre slots.
2. **Pre-op queue** — patient is physically present here: nursing/anesthesia pre-op checks,
   consent, fasting confirmation.
3. **Theatre list** — the day's schedule, ordered by priority/case type; theatre staff work
   through it case by case.
4. Procedure performed.
5. **Recovery/PACU queue** — post-anesthesia monitoring queue before the patient is cleared to
   leave theatre.
6. Patient routed onward: back to a ward (§3.3) for inpatient recovery, or straight to discharge
   for same-day procedures.

### 3.9 Billing & Insurance
1. Charges accumulate against the patient as they move through
   OPD/A&E/wards/lab/radiology/theatre/pharmacy queues.
2. Self-paying patient settles at each cashier queue they pass through, or as one consolidated
   bill at the end of a stay.
3. Insured patient: charges are routed to their insurance scheme instead of, or split with,
   direct payment.
4. Insurance-side staff review the claim on their own claims-review worklist, approve or reject.
5. Approved amounts settle against the hospital's receivables; rejected amounts revert to the
   patient.

### 3.10 Ongoing Admin
- Add/deactivate branches, staff, roles.
- Adjust pricing, drug catalog, test/imaging/theatre procedure catalogs, bed/ward list over time.
- Monitor queue lengths/wait times and department activity.

---

## 4. Lab Flow (standalone diagnostic center)

Same queue chain as the hospital's lab department (§3.6), just without a consultation ever
feeding into it:

1. Onboarding: org + branch(es), staff (lab admin, technicians, phlebotomists), test catalog and
   pricing.
2. **Reception/registration queue** — patient walks in, or arrives referred by an outside
   doctor/hospital with a test request. Registered lightweight (identity + contact, not a full
   medical record).
3. **Cashier queue** — requested test(s) billed and paid.
4. **Sample collection queue** — patient waits, staff call them, collect sample(s), patient is
   released.
5. **Result-pending queue** — sample processed by a technician.
6. **Verification queue** — senior tech/lab admin signs off.
7. **Results-ready queue** — released to the patient (print/portal/notification) and to the
   referring doctor if there was one.

---

## 5. Pharmacy Flow (standalone retail pharmacy)

1. Onboarding: org + branch(es), staff (pharmacist, technician, cashier), drug catalog and
   opening stock.
2. **Counter queue** — customer arrives, with or without a prescription (from any
   hospital/doctor, not necessarily one running CareFusion).
3. Staff selects items — prescription drugs and/or OTC — checks stock.
4. **Cashier queue** — bill generated and paid (often the same physical counter as step 2/3, but
   a distinct step in the chain).
5. **Dispensing queue** — drugs handed over, stock decremented.
6. Stock replenishment runs on its own schedule, independent of any customer queue: reorder
   raised to a supplier, stock received, quantities updated.

---

## 6. Common Threads Across All Tenant Types

- Every tenant follows **onboard org → onboard staff → enter reference data** before going
  operational.
- Every operational flow is a **chain of queues**: registration → cashier → the
  service-delivery station(s) → dispensing/results-release. What differs by tenant type is how
  many stations sit in the chain, not the mechanic itself.
- A department is frequently a chain of sub-queues in its own right (nursing's vitals queue vs.
  injection room; lab's sample collection vs. result-pending vs. verification) — model the
  sub-queue, not the department, as the unit of work.
- Object-level worklists (sample/result processing, image reporting, claims review) are distinct
  from patient-facing queues (triage, phlebotomy, doctor's room, pharmacy counter, imaging) — the
  patient isn't present for the former.
- "Ready" states (results ready, prescription ready) are virtual queues that trigger a
  notification rather than a physical line.
- Insurance billing is optional per tenant, not hospital-exclusive — a standalone Lab or Pharmacy
  can bill insurance too if their business model calls for it.
- Priority/urgency can jump any queue, at any station.
