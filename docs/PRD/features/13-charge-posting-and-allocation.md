# Feature PRD — Charge Posting & Allocation

Status: Draft — Phase 1 building · Last updated: 2026-10-21
Depends on: `10-billing-accounts-and-coverage.md` (`Charge`, `ChargeAllocation`, `Coverage`, `Plan`,
`PlanBenefit`, `BenefitUsage`), `11-encounters-and-patient-journey.md` (encounter start, the payment
gate), `12-billables-and-price-catalog.md` (items, price lines, price resolution).
Completes: `10` §6.2 (allocation at posting, "PRD 10 step 4") and `12` §12 (the charge-integration
slice).

This document defines how a charge gets its item and price from the catalog, and how one charge is
split between the parties who owe it (payer, patient, hospital). It doesn't change how payments are
applied, reconciled or written off (`10` §7–8).

## 1. Decisions Record

| # | Decision | § |
|---|---|---|
| D1 | **Every charge is for a billable item.** The item must be active, in an active category, and have a current self-pay price. A charge can't be posted with a typed-in description or amount. | 3 |
| D2 | **Staff choose the item; the backend prices it.** Registration and encounter start receive item ids from the frontend. There are no system keys and no fee settings. | 4 |
| D3 | **A charge is priced once, at the service date**, and records how the price was reached (`12` §9.2). Later price changes never alter it. | 3 |
| D4 | **The price is never split; ownership is.** One bill is one `Charge`. Copay, caps and exclusions are separate `ChargeAllocation` rows that always add up to the charge amount. | 5 |
| D5 | **Covered items are priced at the payer's price; everything else at the self-pay price.** A patient paying for an item their plan doesn't cover pays the hospital's own price, not the payer's tariff. | 5.1 |
| D6 | **Copay is a percentage of the payer's price.** A 10% copay on Hygeia's ₦15,000 tariff is ₦1,500. | 5.2 |
| D7 | **Rounding:** the payer share is worked out and rounded half-up to kobo; the patient's share is the charge amount minus the payer share, so the two always add up exactly. | 5.3 |
| D8 | **Quantity is a `Decimal`** (12, 3): 2.5 bed-days, 7.5 ml. The line amount is `quantity × unitPrice`, rounded once. | 3 |
| D9 | **Built in two phases.** Phase 1: catalog pricing for self-pay charges (now). Phase 2: insured allocation (copay, caps, pre-authorisation). | 6 |

## 2. What Problem This Solves

Today a charge carries a typed description and a price from a flat setting
(`Organization.registrationFee`, `nfcCardFee`, `consultationFee`). Nothing links it to what was
sold, so price lists, tariffs and dispute evidence can't work, and every hospital pays one flat
consultation fee whatever the clinic. Insured charges are refused outright (`post()` throws for a
`coverageId`), so an HMO patient's visit can't be billed at all.

## 3. Pricing a Charge

`ChargesService.post()` takes a **resolved price** instead of a description and amount:

```ts
type ChargePrice = {
    billableItemId: string;
    description:    string;              // the item's name, snapshotted on the charge
    category:       ServiceCategory;     // the item category's kind
    unitPrice:      Decimal;             // 2 dp
    basis:          PriceBasis;          // how it was worked out
    source:         PriceSource;         // where it came from
    itemPriceId:    string;              // the line used
    itemCostId:     string | null;       // the cost used, for MARKUP
    percent:        Decimal | null;      // the markup or discount percent used
    agreementId:    string | null;       // Phase 2: the payer line's agreement
    payerDiscountId: string | null;      // Phase 2: the payer's default discount
};
```

The price comes from `PricingService` in the billables module (`12` §9), which Billing imports.
Callers resolve the prices **before** opening their transaction, so a bad item fails fast
(400 naming it) without using up a patient number or opening an encounter.

Resolution fails with a 400 when an item is unknown or another organisation's, inactive, in an
inactive category, or has no self-pay price in effect (including a `MARKUP` line with no cost).

The charge stores `billableItemId`, the snapshot fields, `quantity` (Decimal) and
`amount = round_half_up(quantity × unitPrice, 2)`. `category` and `description` stay on the
charge as snapshots, so renaming or recategorising an item never rewrites old bills.

A ₦0 item (a free registration) is still posted as a charge, with no allocations, so the record
shows it was given and at what price.

### 3.1 Schema

`Charge` gains:

```prisma
  billableItemId  String?                       // null only on charges posted before PRD 13
  pricingBasis    PriceBasis?
  priceSource     PriceSource?
  itemPriceId     String?
  itemCostId      String?
  agreementId     String?
  payerDiscountId String?
  pricePercent    Decimal?    @db.Decimal(5, 2)
  quantity        Decimal     @default(1) @db.Decimal(12, 3)   // was Int

  billableItem    BillableItem?   @relation(fields: [billableItemId], references: [id])
  itemPrice       ItemPrice?      @relation(fields: [itemPriceId], references: [id])
  itemCost        ItemCost?       @relation(fields: [itemCostId], references: [id])
  agreement       PayerAgreement? @relation(fields: [agreementId], references: [id])
  payerDiscount   PayerDiscount?  @relation(fields: [payerDiscountId], references: [id])

  @@index([billableItemId])
```

The fields are nullable only because charges posted before this PRD have none. Every new charge
sets `billableItemId`, `pricingBasis`, `priceSource` and `itemPriceId` (the service requires them).

## 4. Where Charges Are Posted

| Where | Item(s) | Charged when |
|---|---|---|
| **Patient registration** (`POST /patients`) | `billableItemIds?: string[]`: the registration and card fees the staff member selected. Each is one charge, quantity 1 | Always, for each item given. None given = nothing billed |
| **Encounter start** (`POST /encounters`) | `billableItemId`: the consultation item the staff member selected (required) | As today (`11` §10.4): not when continuing an open encounter at the same clinic, and not for an insured visit until Phase 2 |

The item's kind isn't restricted at these points: the hospital decides what it charges at
registration. The frontend can offer the clinic's linked items (`12` §4.4) at encounter start.

## 5. Allocation (Phase 2)

### 5.1 Steps

1. **Coverage:** the visit's selected coverage, or none (self-pay, or `selfPay: true`).
2. **Benefit:** the plan's `PlanBenefit` for the item's kind. Missing or `covered: false` = not
   covered.
3. **Price:** covered → the payer's price (`12` §9.1: payer line, else payer default discount,
   else self-pay). Not covered or no coverage → the self-pay price.
4. **Split** into allocations (§5.2) and update `BenefitUsage` counters in the same transaction.

### 5.2 Allocation table

| Situation | Allocations |
|---|---|
| Self-pay | ACCOUNT · `NOT_COVERED` · full amount (Phase 1) |
| Covered, 10% copay | PAYER · `COVERED` · 90% + ACCOUNT · `COPAY` · 10% |
| Covered with a per-service cap (Hygeia Basic: ₦15,000 price, cap ₦10,000) | PAYER · `COVERED` · 10,000 + ACCOUNT · `OVER_LIMIT` · 5,000 |
| Copay and cap | Copay first; the payer share is then capped and the excess goes to ACCOUNT · `OVER_LIMIT` |
| Annual / category limit nearly used | The payer share is capped at what remains; the excess per the plan's `overLimitAction` (`BILL_TO_ACCOUNT` → ACCOUNT · `OVER_LIMIT`; `REQUIRE_APPROVAL` → `10` §6.3) |
| Plan excludes the kind | ACCOUNT · `NOT_COVERED` · full amount at the self-pay price |
| Needs pre-authorisation | The PAYER allocation starts `PENDING_AUTH` (Insurance queue, `10` §9.2) |

### 5.3 Rounding

`payerShare = round_half_up(min(amount × (100 − copay%) / 100, caps…), 2)`;
`patientShare = amount − payerShare`. Rounding the patient's share separately could leave the two a
kobo apart from the charge amount.

### 5.4 Schema (Phase 2)

`PlanBenefit` gains `perServiceLimit Decimal? @db.Decimal(14, 2)`: the most the payer pays for one
charge of that kind ("consultation up to ₦10,000"). Today only an annual limit per category exists.

## 6. Phases

**Phase 1 — catalog pricing for self-pay (now)**
- `PricingService.selfPayPrices(organizationId, itemIds, at)` in billables, exported to Billing.
- `Charge` schema of §3.1; `ChargesService.post()` takes `price: ChargePrice` and `quantity`.
- Registration takes `billableItemIds`; encounter start takes `billableItemId`.
- Registration and encounter start stop reading `Organization.registrationFee`, `nfcCardFee` and
  `consultationFee`. **The columns stay for now**: the clinics module's consultation-fee preview and
  organisation set-up still use them. They're removed once those move to the catalog.
- Insured charges stay refused, and an insured visit's consultation is still not charged.

**Phase 2 — insured allocation**
- Payer price resolution (`12` §9.1 steps 4–7), the allocation table, `BenefitUsage`, pre-auth,
  `PlanBenefit.perServiceLimit`.
- `post()` accepts `coverageId`; the encounter-start exemption for insured visits is removed.

## 7. Out of Scope

- Payments, reconciliation, write-offs (`10` §7–8, unchanged).
- Coordination of benefits (one charge split across two payers).
- Lab, pharmacy, radiology and ward charges: each module posts through the same `post()` when it's
  built.
