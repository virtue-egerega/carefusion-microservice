# Feature PRD — Prescriptions

Status: Draft — finding a medicine (§3) agreed and built; the prescription itself next to design · Last updated: 2026-11-09
Depends on: `15-inventory-drugs-and-consumables.md` (`Medicine`, `TherapeuticUse`, §3.1),
`14-consultations.md` (the consultation a prescription is written in), `11-encounters-and-patient-journey.md`
(`Encounter`), `05-access-control-clinical-scoping.md` (permissions).
Changes: `14` §10 and `11` §17, which had a prescription point at a billable item and post a charge
when placed. A prescription now names a medicine and posts nothing (D2); billing happens at the
dispensary.

This document defines prescribing: how a prescriber finds a medicine, and (next) what a
prescription records. Dispensing, which decides what is given and whether it's billed, is its own PRD.

## 1. Decisions Record

| # | Decision | § |
|---|---|---|
| D1 | **Prescriptions are a top-level module** (`src/prescriptions/`), like consultations and triage. *(2026-11-09)* | 2 |
| D2 | **A prescription is a clinical order, not billing and not stock.** It names any medicine on the medicine list, whether or not the hospital holds it. At the dispensary the pharmacy says whether it will be given and billed (or bought outside). *(2026-11-09)* | 2 |
| D3 | **Prescribers search the medicine list, never products.** By name, strength, alias, ingredient or therapeutic use, active medicines only; no stock, products or prices. *(2026-11-09)* | 3 |
| D4 | **Seeing the medicine list is not seeing stock.** `pharmacy.medicine.view` is its own key (`15` §17), so doctors, midwives and nurses can hold it without `pharmacy.stock.view`. Prescribing search needs only `prescription.create`. *(2026-11-09)* | 3.2 |

## 2. What Problem This Solves

A doctor prescribes what the patient needs, not what the hospital pharmacy happens to hold. If
prescribing were limited to stocked products, a drug the hospital doesn't carry couldn't be written
at all, and the record of what was prescribed would depend on the store. So prescribing works against
the medicine (`15` §3.1: generic name, strength, form, route), the same in every hospital; the
dispensary later matches it to a product and batch, or tells the patient to buy it outside.

## 3. Finding a Medicine

### 3.1 What is searched

Every **active** medicine the organisation sees: the seeded list plus its own `USER_ADDED` medicines
(`visibleMedicines`, `15` §3.1). Products, stock, batches and prices are never read.

`search` (free text, any case) matches either:
- the medicine's `searchText`: generic name, strength, aliases and ingredients, lower case and
  trigram-indexed (`15` §3.1). "PCM", "acetaminophen" and "amoxicillin 500" all work;
- **or the name of one of its therapeutic uses**, so "malaria" or "hypertension" finds the drugs for
  it.

Filters, each optional: `therapeuticUse` (code), `bodySystem`, `dosageForm`, `route`,
`legalCategory`, `controlled` (true / false).

### 3.2 API

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/api/prescriptions/medicines` | GET | `prescription.create` | `{ count, docs }` (`limit` 20 / `offset` 0), ordered by generic name, strength, form, route. Each doc `{ id, genericName, strength, dosageForm, route, legalCategory, controlled, therapeuticUses: [{ code, name }] }`. Query: `search`, `therapeuticUse`, `bodySystem`, `dosageForm`, `route`, `legalCategory`, `controlled` |

The pharmacy's own `GET /pharmacy/medicines` stays the management view (inactive medicines,
`source`, `seededMatch`, products), now behind `pharmacy.medicine.view` instead of
`pharmacy.stock.view` (`15` §17–18).

### 3.3 Code

`src/prescriptions/`: `prescriptions.controller.ts`, `prescriptions.service.ts`,
`prescriptions.rules.ts` (`prescribableMedicines`: the `where` for §3.1, tested in
`prescriptions.rules.spec.ts`). No schema change.

## 4. Next to Design

- **The prescription and its lines**: medicine, dose, frequency, duration, quantity, route (when it
  differs from the medicine's), instructions; written in a consultation, attached to the encounter.
- **Status** from written to dispensed (in full, in part, not available / bought outside), and
  cancelling or changing a line.
- **How Dispensing picks it up**: the pharmacy queue task, matching a line to a product and batch
  (`15` §12, D10), and the billing decision made there.
- **Allergy checks** against the patient's allergies (`14` §10).
- **Inpatient prescriptions** feeding the ward medication round (`11`).

## 5. Out of Scope

- Dispensing, issuing stock and charging (Dispensing PRD).
- Medication administration on the ward (Nursing PRD).
- Drug–drug interaction checking.

## 6. Open Decisions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should prescribers also get a therapeutic-use list behind `prescription.create`, or hold `pharmacy.medicine.view` for `GET /pharmacy/medicines/therapeutic-uses`? | Grant `pharmacy.medicine.view` to prescribing profiles; no duplicate endpoint |
