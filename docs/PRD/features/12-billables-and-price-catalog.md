# Feature PRD — Billables & Price Catalog

Status: Draft · Last updated: 2026-10-20
Depends on: `02-hospital-onboarding.md` (`Organization`), `05-access-control-clinical-scoping.md`
(`Permission`, `DutyProfile`), `10-billing-accounts-and-coverage.md` (`Payer`, `Plan`,
`PlanBenefit`, `Charge`, `ServiceCategory`).
Answers: `11` Q5 (the price catalog) and `10` §15 (payer-specific tariffs).
Will supersede, when charge posting is moved onto the catalog (§12): `Organization.registrationFee`,
`Organization.nfcCardFee`, `Organization.consultationFee`, and the `ConsultationType` model.

This document defines what the hospital can bill for (billables), how they are grouped
(categories), what they cost the hospital (cost prices), and what each one costs each payer over
time (price lines, agreements, discounts). It does **not** decide who pays for a charge or how much
of it a plan covers. That is the charge's job (`10` §5–6). It also does not define drug details,
stock or batches, which have their own PRD.

**Scope of the first slice: create and see billables.** Categories, items, cost prices, price
lines, payer agreements, payer discounts, an item's price list across payers, a payer's tariff
list, and a price preview. **Charge posting is not changed anywhere in the app by this slice**
(§12).

**Terminology.** *Self-pay* is the hospital's own price for an item, paid when no payer is
involved. There is no separate "standard" list: self-pay is that list.

## 1. Decisions Record

Agreed during design review, 2026-10-20. Each is elaborated in the section shown.

| # | Decision | § |
|---|---|---|
| D1 | **Hospitals create their own billable categories.** Each category has a fixed `kind` from the system `ServiceCategory` enum, so plan benefits, caps and reports keep working whatever the hospital calls its categories. Categories are flat (no nesting) in v1. `CONSUMABLE` is added to `ServiceCategory`. | 3 |
| D2 | **A billable item belongs to one category.** Items are deactivated, never deleted. Items the system posts on its own (registration, card, consultation) are found by a stable `systemKey`. | 4 |
| D3 | **Drugs are a type of billable**: an item in a category of kind `PHARMACY`. Drug details, stock and batches are extensions designed in the drugs PRD. | 4.3 |
| D4 | **Price belongs to the payer, not the plan.** The tariff is agreed between the hospital and the payer (Hygeia ₦15,000, AXA Mansard ₦12,000). Plans decide only what is covered and up to how much, which is a charge problem. | 6 |
| D5 | **Every active item has a self-pay price line.** It is the price when no payer is involved, and the only base any discount is taken from. | 6 |
| D6 | **Every price line records its basis**: `TARIFF` (a fixed amount under a payer agreement), `DISCOUNT` (a percentage off the self-pay price), `MARKUP` (a percentage on top of cost), or `MANUAL` (an amount set by hand with a reason). | 6.1 |
| D7 | **A payer's discount is always off the self-pay price.** One payer's prices never depend on another payer's. | 6.1, 8 |
| D8 | **The hospital holds cost prices**, dated, for anything it buys at market prices (drugs, consumables). Markup lines are worked out from the cost in effect on the pricing date, so a cost change reprices them automatically. | 5 |
| D9 | **Tariffs point at a `PayerAgreement`** (reference, dates, document), so every tariff amount can be traced to the contract that set it. | 7 |
| D10 | **A payer's price for an item is found in this order:** the payer's own price line for the item; otherwise the payer's default discount off self-pay; otherwise the self-pay price. The result always records the basis, where it came from (`PAYER_LINE`, `PAYER_DISCOUNT`, `SELF_PAY`), and every row used. | 9 |
| D11 | **History is never edited or deleted.** Prices, costs and discounts are dated rows. A change closes the current row and adds a new one. Backdating is not allowed. A December charge can always be explained with December's figures. | 6.3 |
| D12 | **Money is stored to 2 decimal places (kobo), never more.** Cost is stored as the price of a pack and the number of units in it, exactly as invoiced, so no per-unit fraction of a kobo is ever stored. A worked-out price is rounded half-up to 2 places **once**, at the end. `Charge.quantity` becomes a `Decimal` (§12). | 5, 9.2 |
| D13 | **Billables has its own `billable.*` permissions, one per action**: creating a category, an item, a price line or a cost are separate keys. Price, cost and discount changes always need a reason. Cost has its own view key, because it reveals the hospital's margin. | 10 |
| D14 | **Payers can be deactivated.** A deactivated payer keeps its price, agreement and discount history but can't be given new ones and can't be priced for. | 8.2 |

## 2. What Problem This Solves

Today prices are scattered and flat: `Organization.registrationFee`, `nfcCardFee` and
`consultationFee` are single numbers. `ConsultationType` is just a name. Every other module
(lab, radiology, theatre, ward, pharmacy) would otherwise invent its own price field. And real
hospitals don't have one price per service:

- **Each HMO has a negotiated tariff.** Consultation might be ₦15,000 for Hygeia, ₦12,000 for AXA
  Mansard and ₦20,000 for self-pay.
- **Tariffs change over time.** AXA might move to ₦14,500 from January. A December bill must still
  show ₦12,000 and why.
- **Not every item is negotiated.** A corporate retainer often agrees "15% off your self-pay price"
  for everything, or for some items only.
- **Drugs and consumables follow the market.** Their prices are cost plus a percentage, and cost
  changes whenever the supplier's price does.
- **Disputes need evidence.** When a payer rejects a line as "above agreed tariff" (`10`
  `PAYER_TARIFF_DISPUTE`), the hospital has to show which agreement, which version and which date
  produced the amount.

The catalog answers four questions:

| Question | Answered by |
|---|---|
| What can the hospital bill for? | `BillableCategory`, `BillableItem` (§3, §4) |
| What does it cost the hospital? | `ItemCost` (§5) |
| What does it cost this payer on this date? | `ItemPrice`, `PayerAgreement`, `PayerDiscount`, price resolution (§6–9) |
| How was that price reached? | The resolution result: basis, source and rows used (§9.2) |

What it deliberately doesn't answer: **whether the patient's plan covers it, and up to how much.**
Hygeia's Silver plan covering consultation up to ₦20,000 and Basic up to ₦10,000 doesn't change
the price (₦15,000). It changes how the charge is split: Silver → Hygeia ₦15,000; Basic → Hygeia
₦10,000 and patient ₦5,000. That is allocation (`10` §6) and the insurance PRD.

## 3. Categories

### 3.1 `BillableCategory`

```prisma
model BillableCategory {
  id             String          @id @default(uuid())
  organizationId String
  name           String                       // "Haematology", "Ward Consumables", "Physiotherapy"
  kind           ServiceCategory              // system meaning: LABORATORY, PHARMACY, CONSUMABLE…
  description    String?
  status         CatalogStatus   @default(ACTIVE)
  createdAt      DateTime        @default(now())
  createdBy      String
  updatedAt      DateTime        @updatedAt
  updatedBy      String?

  organization   Organization    @relation(fields: [organizationId], references: [id])
  items          BillableItem[]

  @@unique([organizationId, name])
  @@index([organizationId, kind])
}

enum CatalogStatus {
  ACTIVE
  INACTIVE
}
```

`ServiceCategory` gains `CONSUMABLE` (gloves, syringes, dressings), so a plan can have a
consumables benefit separate from drugs.

### 3.2 Rules

- **The name is the hospital's; the kind is the system's.** `ServiceCategory` is already what
  `PlanBenefit`, `BenefitUsage` and `Charge.category` use. A hospital can have "Haematology" and
  "Chemical Pathology" as separate categories, both of kind `LABORATORY`, and a plan's laboratory
  benefit covers both.
- **`kind` can't change once the category has items.** Changing it would silently move every item
  into a different benefit. Create a new category and move the items instead.
- **Deactivating a category** hides it from new item creation. Its items keep their own status, but
  an item in an inactive category can't be priced (§9.1).
- **Flat in v1.** Reporting already groups by `kind`; a second grouping level adds tree handling
  without a current need.
- `CatalogStatus` is a new enum rather than reusing `AccountStatus` (`ACTIVE/SUSPENDED/CLOSED`),
  whose values describe accounts, not catalog entries.

## 4. Items

### 4.1 `BillableItem`

```prisma
model BillableItem {
  id             String           @id @default(uuid())
  organizationId String
  categoryId     String
  code           String                        // hospital's own code, e.g. "LAB-FBC"; unique per org
  name           String                        // "Full Blood Count"
  description    String?
  unit           String                        // what one quantity means: "test", "visit", "day", "tablet"
  systemKey      String?                       // stable key for items the system posts itself (§4.2)
  status         CatalogStatus    @default(ACTIVE)
  createdAt      DateTime         @default(now())
  createdBy      String
  updatedAt      DateTime         @updatedAt
  updatedBy      String?

  organization   Organization     @relation(fields: [organizationId], references: [id])
  category       BillableCategory @relation(fields: [categoryId], references: [id])
  prices         ItemPrice[]
  costs          ItemCost[]

  @@unique([organizationId, code])
  @@unique([organizationId, systemKey])         // nulls are distinct, so many items have none
  @@index([organizationId, categoryId, status])
}
```

### 4.2 Rules

- **Created with its self-pay price line** (and, for a `MARKUP` line, its first cost) in one
  transaction. This guarantees D5: there is no moment where an active item can't be priced.
- **Moving an item to another category is allowed only within the same `kind`.** Moving a lab test
  into a pharmacy category would change which benefit covers it. Charges keep their own
  `category` snapshot, so history is unaffected either way.
- **Never deleted.** An item that was ever priced may be on a charge. Deactivating it stops new
  pricing (§9.1). Its prices, costs and history stay readable.
- **`code` and `name` can be edited.** Charges snapshot their `description` (`10` §5), so renaming
  doesn't rewrite old bills.
- **`systemKey`** is how code finds items it posts without a person choosing them: for example
  `REGISTRATION_FEE`, `CARD_FEE`, `CONSULTATION_GOPD_FIRST`. The set of keys is defined in code
  (like queues, `04`). The hospital prices the item but can't change its key. Seeding the keyed
  items and wiring charge posting to them is part of §12's later slice.

### 4.3 Drugs (deferred)

A drug is a `BillableItem` in a `PHARMACY`-kind category. The drugs PRD adds a 1:1 extension
(`Drug.billableItemId`) for strength, form and the like, plus stock and batches. A batch has its
own purchase cost; the drugs PRD decides whether receiving a batch writes an `ItemCost` row (§5)
or whether markup reads batch cost directly. Nothing in this PRD prevents either.

## 5. Cost Prices

### 5.1 `ItemCost`

What the hospital pays for an item it buys, stored **as invoiced**: the price of a pack and how
many of the item's units are in it.

```prisma
model ItemCost {
  id            String       @id @default(uuid())
  itemId        String
  packCost      Decimal      @db.Decimal(14, 2)   // ₦1,234.50 for the pack
  unitsPerPack  Int          @default(1)          // 100 (of the item's unit) in that pack
  effectiveFrom DateTime                          // inclusive
  effectiveTo   DateTime?                         // exclusive; null = open-ended
  source        String?                           // supplier invoice no., market survey…
  reason        String
  createdAt     DateTime     @default(now())
  createdBy     String
  endedAt       DateTime?
  endedBy       String?
  endReason     String?
  cancelledAt   DateTime?
  cancelledBy   String?

  item          BillableItem @relation(fields: [itemId], references: [id])

  @@index([itemId, effectiveFrom])
}
```

```sql
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_no_overlap
  EXCLUDE USING gist ("itemId" WITH =, tsrange("effectiveFrom", "effectiveTo") WITH &&)
  WHERE ("cancelledAt" IS NULL);
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_pack_cost_non_negative CHECK ("packCost" >= 0);
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_units_positive CHECK ("unitsPerPack" > 0);
ALTER TABLE "ItemCost" ADD CONSTRAINT item_cost_period_valid
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
```

### 5.2 Why pack cost, not unit cost (D12)

Money is described to 2 decimal places. A box of 100 bought for ₦1,234.50 works out to a unit cost
between two whole kobo, which can't be stored as money. Storing the pack cost and the count keeps
every stored figure in naira and kobo, matches the supplier's invoice line exactly (which is what an
auditor compares against), and lets markup divide and round **once**:

> ₦1,234.50 ÷ 100 × 1.30 = 16.0485 → **₦16.05**

Rounding the unit cost first (to ₦12.35) and then marking up would give 12.35 × 1.30 = 16.055 →
₦16.06: one kobo too much per unit, carried into every charge.

### 5.3 Changing a cost

Same rules as price lines (§6.3): append-only, no backdating, no overlap, a reason on every row.
When the supplier's price moves, the current cost row is closed and a new one starts, and every
`MARKUP` line for the item is repriced from that date with no new price rows. Any item may have
costs; only `MARKUP` lines need them. A `MARKUP` line can't be created for an item with no cost
in effect, and the open cost of an item with an active `MARKUP` line can only be replaced, not
ended.

## 6. Price Lines

### 6.1 `ItemPrice`

One row per (item, payer, period). `payerId = null` is the self-pay line.

```prisma
model ItemPrice {
  id            String          @id @default(uuid())
  itemId        String
  payerId       String?                        // null = self-pay
  basis         PriceBasis
  amount        Decimal?        @db.Decimal(14, 2)  // TARIFF, MANUAL
  percent       Decimal?        @db.Decimal(5, 2)   // DISCOUNT (off self-pay), MARKUP (on cost)
  agreementId   String?                        // required for TARIFF; optional on other payer lines
  effectiveFrom DateTime                       // inclusive
  effectiveTo   DateTime?                      // exclusive; null = open-ended
  reason        String                         // "Hygeia tariff 2026", "One-off price for theatre list"
  createdAt     DateTime        @default(now())
  createdBy     String
  endedAt       DateTime?
  endedBy       String?
  endReason     String?
  cancelledAt   DateTime?
  cancelledBy   String?

  item          BillableItem    @relation(fields: [itemId], references: [id])
  payer         Payer?          @relation(fields: [payerId], references: [id])
  agreement     PayerAgreement? @relation(fields: [agreementId, payerId], references: [id, payerId], onDelete: Restrict)

  @@index([itemId, payerId, effectiveFrom])
  @@index([payerId, effectiveFrom])
  @@index([agreementId])
}

enum PriceBasis {
  TARIFF    // fixed amount agreed with the payer, under an agreement
  DISCOUNT  // percent off the item's self-pay price
  MARKUP    // percent on top of the item's cost
  MANUAL    // amount set by hand, no formula, reason required
}
```

| Basis | Stores | Allowed on | Price worked out as |
|---|---|---|---|
| `TARIFF` | `amount`, `agreementId` | payer lines | the amount |
| `DISCOUNT` | `percent` (0 < % < 100) | payer lines | self-pay price × (100 − %) / 100 |
| `MARKUP` | `percent` (≥ 0) | self-pay and payer lines | packCost ÷ unitsPerPack × (100 + %) / 100 |
| `MANUAL` | `amount` | self-pay and payer lines | the amount |

The self-pay line is `MANUAL` or `MARKUP` only. It can't be a discount off itself, and there's no
agreement for self-pay. A payer line can be any of the four: HMOs commonly agree "cost + 20%" for
drugs, and a corporate retainer may agree "self-pay − 15%" on named items.

"Manual" is a catalog line set by hand. **It is not a price change on one patient's bill**: that is
an `ADJUSTMENT` request with approval (`10` §8).

### 6.2 Integrity (appended SQL)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- no two live lines for the same (item, payer) overlap in time; null payer = self-pay
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_no_overlap
  EXCLUDE USING gist (
    "itemId" WITH =,
    COALESCE("payerId", '') WITH =,
    tsrange("effectiveFrom", "effectiveTo") WITH &&
  ) WHERE ("cancelledAt" IS NULL);

ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_basis_fields CHECK (
  CASE "basis"
    WHEN 'TARIFF'   THEN "amount" IS NOT NULL AND "percent" IS NULL AND "agreementId" IS NOT NULL AND "payerId" IS NOT NULL
    WHEN 'MANUAL'   THEN "amount" IS NOT NULL AND "percent" IS NULL AND "agreementId" IS NULL
    WHEN 'DISCOUNT' THEN "percent" IS NOT NULL AND "amount" IS NULL AND "payerId" IS NOT NULL
                         AND "percent" > 0 AND "percent" < 100
    WHEN 'MARKUP'   THEN "percent" IS NOT NULL AND "amount" IS NULL AND "percent" >= 0
  END
);
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_self_pay_no_agreement
  CHECK ("payerId" IS NOT NULL OR "agreementId" IS NULL);
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_amount_non_negative
  CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "ItemPrice" ADD CONSTRAINT item_price_period_valid
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
```

**The agreement must belong to the line's payer.** This is a composite foreign key in the Prisma
schema: `ItemPrice.(agreementId, payerId)` → `PayerAgreement.(id, payerId)`, with
`@@unique([id, payerId])` on `PayerAgreement` and `onDelete: Restrict`. The database itself rejects
a line pointing at another payer's agreement, so the service doesn't need to look it up first.

### 6.3 Changing a price

Rows are **append-only**. The only fields ever set after insert are `effectiveTo`/`endedAt`/
`endedBy`/`endReason` (once, to close a row) and `cancelledAt`/`cancelledBy` (once, to withdraw a
row that never took effect). The same three actions apply to costs (§5) and discounts (§8).

| Action | What happens |
|---|---|
| **New line** (`effectiveFrom` defaults to now) | `effectiveFrom` must not be in the past (no backdating, D11). The line currently open for that (item, payer) gets `effectiveTo = new.effectiveFrom`. The new row is inserted. If a line is already scheduled after `new.effectiveFrom`, the request is refused; withdraw that one first. |
| **End a payer line** (reason required) | Sets `effectiveTo` (now or a future date) and `endedAt/By/Reason`. From then on that payer falls back to its default discount or the self-pay price (§9). **Not allowed on the self-pay line while the item is active** (D5); replace it with a new line instead. |
| **Withdraw a scheduled line** | Only while `effectiveFrom` is still in the future, so nothing can have been priced from it. Sets `cancelledAt/By`. If adding it had closed an earlier row, that row's `effectiveTo` is reopened to null, since that closure never took effect. |

Each runs in one transaction. The exclusion constraint is the backstop: two people scheduling
overlapping lines at once can't both succeed.

**Worked timeline** for the consultation item:

| payer | basis | amount / % | from | to | agreement / reason |
|---|---|---|---|---|---|
| (self-pay) | `MANUAL` | 20,000.00 | 2026-12-01 | — | "2026 price review" |
| Hygeia | `TARIFF` | 15,000.00 | 2026-06-01 | — | HYG/2026/014 |
| AXA Mansard | `TARIFF` | 12,000.00 | 2026-03-01 | 2027-01-01 | AXA-TRF-2026 |
| AXA Mansard | `TARIFF` | 14,500.00 | 2027-01-01 | — | AXA-TRF-2027 |

Adding AXA's January line (in December) closed the 12,000 row at 1 January. A charge on 15
December resolves to row 3; one on 5 January resolves to row 4.

## 7. Payer Agreements

### 7.1 `PayerAgreement`

The contract a tariff comes from. A tariff renewal is one event covering many items. Pointing every
`TARIFF` line at its agreement makes "everything under AXA's 2027 agreement" one query, and puts
the contract in front of anyone handling a tariff dispute.

```prisma
model PayerAgreement {
  id          String      @id @default(uuid())
  payerId     String
  reference   String                        // the payer's or hospital's contract/tariff number
  title       String?                       // "AXA Mansard provider tariff 2027"
  signedOn    DateTime?
  validFrom   DateTime
  validTo     DateTime?
  documentRef String?                       // file storage reference (same rules as `10` §8 attachments)
  notes       String?
  createdAt   DateTime    @default(now())
  createdBy   String
  updatedAt   DateTime    @updatedAt
  updatedBy   String?

  payer       Payer       @relation(fields: [payerId], references: [id])
  prices      ItemPrice[]

  @@unique([payerId, reference])
  @@unique([id, payerId])                   // target of ItemPrice's composite FK (§6.2)
}
```

### 7.2 Rules

- **An agreement's dates describe the contract; each line's own dates decide when it applies.** A
  line isn't forced inside the agreement's validity. Contracts often run on after expiry while a
  renewal is negotiated, and the hospital keeps billing the old tariff.
- **Agreements are never deleted.** Their details (title, document, notes, `validTo`) can be
  corrected; the lines pointing at them are the price history.
- An agreement may also back `DISCOUNT` or `MARKUP` lines ("cost + 20% on drugs" in the same
  contract). Only `TARIFF` requires one.

## 8. Payer Default Discounts

### 8.1 `PayerDiscount`

The payer's default discount off the self-pay price, used for items with no payer line. It's dated
like a price line, not a single column on `Payer`, because a charge priced by the default discount
in December must still show it was 10% after the payer moves to 15% in January (D11).

```prisma
model PayerDiscount {
  id            String    @id @default(uuid())
  payerId       String
  percent       Decimal   @db.Decimal(5, 2)   // 10.00 = 10% off the self-pay price
  effectiveFrom DateTime
  effectiveTo   DateTime?
  reason        String
  createdAt     DateTime  @default(now())
  createdBy     String
  endedAt       DateTime?
  endedBy       String?
  endReason     String?
  cancelledAt   DateTime?
  cancelledBy   String?

  payer         Payer     @relation(fields: [payerId], references: [id])

  @@index([payerId, effectiveFrom])
}
```

```sql
ALTER TABLE "PayerDiscount" ADD CONSTRAINT payer_discount_no_overlap
  EXCLUDE USING gist ("payerId" WITH =, tsrange("effectiveFrom", "effectiveTo") WITH &&)
  WHERE ("cancelledAt" IS NULL);
ALTER TABLE "PayerDiscount" ADD CONSTRAINT payer_discount_percent_range
  CHECK (percent > 0 AND percent < 100);
ALTER TABLE "PayerDiscount" ADD CONSTRAINT payer_discount_period_valid
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
```

New, end and withdraw follow §6.3. Ending a discount is allowed at any time; the payer then falls
back to self-pay for items without a line. 0% is just "no discount" and isn't stored. 100% is a
waiver, which is a plan or write-off matter (`10` §8), not a price.

### 8.2 Deactivated payers

`Payer.status` already exists (`10` §4.1). For the catalog:

- A non-`ACTIVE` payer **can't be given new lines, agreements or discounts** and **can't be priced
  for** (§9.1 step 4).
- Its rows are **kept unchanged**. They remain readable in history and the payer's tariff list,
  and past charges still point at them.
- Reactivating the payer makes its rows usable again from that moment. If the tariff is stale, a
  new line is added the usual way.

## 9. Price Resolution

### 9.1 The rule

`resolvePrice(item, payer | null, at)` is one pure function (`billables/pricing.rules.ts`), given
the rows it needs loaded in one query. Every caller (the preview and list endpoints now, charge
posting later) uses it, so there is exactly one definition of "the price".

1. The item and its category must be `ACTIVE`, or it fails: *item not billable*.
2. Work out the **self-pay price** at `at` from the self-pay line (`MANUAL` amount, or `MARKUP` on
   the cost in effect at `at`). No self-pay line, or a `MARKUP` line with no cost, fails: *item has
   no self-pay price*. That only happens with a data error, given §4.2 and §5.3.
3. **No payer** → source `SELF_PAY`; basis of the self-pay line.
4. The payer must be `ACTIVE`, or it fails: *payer inactive* (D14).
5. **The payer has a line** for the item at `at` → source `PAYER_LINE`, priced by its basis (§6.1).
   A `DISCOUNT` line is taken off the self-pay price from step 2.
6. Otherwise, **the payer has a default discount** at `at` → source `PAYER_DISCOUNT`, basis
   `DISCOUNT`, taken off the self-pay price from step 2.
7. Otherwise → source `SELF_PAY`, the self-pay price. The payer is charged the hospital's own
   price. Seeing `SELF_PAY` against a payer shows a gap in the negotiated list.

Whether the payer actually pays any of it is the plan's decision at charge time. If the plan
doesn't cover the item, there's no payer share at all. The catalog's job ends at the price.

### 9.2 The result (what gets recorded)

```ts
type ResolvedPrice = {
  unitPrice:       Decimal;              // 2 dp, rounded once
  basis:           PriceBasis;           // how it was worked out
  source:          PriceSource;          // where it came from
  itemPriceId:     string;               // the payer line (PAYER_LINE) or the self-pay line
  selfPayPriceId:  string;               // always: the self-pay line in effect
  selfPayAmount:   Decimal;              // the self-pay price at `at`, for display and dispute evidence
  agreementId:     string | null;        // the payer line's agreement, if any
  payerDiscountId: string | null;        // set iff source = PAYER_DISCOUNT
  percent:         Decimal | null;       // the discount or markup percent used
  itemCostId:      string | null;        // set iff a MARKUP was applied
  packCost:        Decimal | null;       // snapshot of the cost used
  unitsPerPack:    number | null;
};
```

```prisma
enum PriceSource {
  PAYER_LINE      // the payer's own line for the item
  PAYER_DISCOUNT  // the payer's default discount off self-pay
  SELF_PAY        // the self-pay price (no payer, or a payer with neither)
}
```

**Rounding (D12).** Arithmetic uses Prisma's `Decimal` (decimal.js), never JavaScript numbers. Each
worked-out price is rounded half-up to 2 places once, as the last step. A discount is taken off the
self-pay price **as charged** (already in whole kobo), because that is the price the payer agreed
a discount from. The charge later multiplies by quantity and rounds the line amount once (§12).

## 10. Permissions

Billables is its own module, not part of billing, so its permissions have their own `billable.*`
namespace in `src/access-control/permissions.catalog.ts`. Each action is a separate key: creating a
category, creating an item, adding a price line and recording a cost are different jobs done by
different people.

| Key | Name | Grants |
|---|---|---|
| `billable.view` | View Billables | Categories, items, price lines, price lists, tariff lists, agreements, discounts, quotes |
| `billable.category.create` | Create Billable Category | Add a category |
| `billable.category.update` | Update Billable Category | Rename, describe, deactivate; change `kind` while empty |
| `billable.item.create` | Create Billable Item | Add an item (with its first self-pay line, §4.2) |
| `billable.item.update` | Update Billable Item | Edit code, name, unit, category (same kind), deactivate |
| `billable.price.create` | Add Price Line | Add a self-pay or payer price line (reason required) |
| `billable.price.end` | End Price Line | End a payer line early (reason required) |
| `billable.price.cancel` | Withdraw Price Line | Withdraw a line that hasn't taken effect |
| `billable.cost.view` | View Cost Prices | See cost prices, markup percentages and margins |
| `billable.cost.create` | Record Cost Price | Add a cost price (reason required) |
| `billable.cost.end` | End Cost Price | End a cost price early (reason required) |
| `billable.cost.cancel` | Withdraw Cost Price | Withdraw a cost that hasn't taken effect |
| `billable.agreement.create` | Add Payer Agreement | Record a payer's tariff agreement |
| `billable.agreement.update` | Update Payer Agreement | Correct an agreement's details or document |
| `billable.discount.create` | Add Payer Discount | Add a payer's dated default discount (reason required) |
| `billable.discount.end` | End Payer Discount | End a discount early (reason required) |
| `billable.discount.cancel` | Withdraw Payer Discount | Withdraw a discount that hasn't taken effect |

**Without `billable.cost.view`, responses leave out cost rows and cost fields** (`packCost`,
`unitsPerPack`, `itemCostId`, and the percent on `MARKUP` lines). The resulting price is still
shown. Cashiers and reception need to see prices, not the hospital's margin.

**Creating an item needs `billable.item.create` and `billable.price.create`**, because it sets the
first self-pay line, plus `billable.cost.create` when that line is `MARKUP` (it records the first
cost). The first two are checked by the route; the third by the service, since it depends on the
request body. A records clerk can maintain the list of services without changing what anything
costs, and a store officer can record costs without setting prices.

**Suggested duty profiles** (seeded, tenant-editable; `10` §10):

| Profile | Gains |
|---|---|
| Finance Manager | every `billable.*` key |
| Billing Supervisor | `billable.view`, `billable.category.*`, `billable.item.*` |
| Cashier, Receptionist, Insurance Officer, Hospital Administrator | `billable.view` |
| Pharmacy/store (drugs PRD) | `billable.view`, `billable.cost.*` |

## 11. APIs

All under `/api`. Every write records `createdBy`/`updatedBy` from the token, and every query is
scoped to the caller's `organizationId`.

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/billable-categories` | POST | `billable.category.create` | Create: `name`, `kind`, `description?` |
| `/billable-categories` | GET | `billable.view` | `{ count, docs }` by name; filter `kind`, `status`, `search` (name); `limit` (20) / `offset`; item counts |
| `/billable-categories/:id` | PATCH | `billable.category.update` | `name`, `description`, `status`; `kind` only while empty |
| `/billable-items` | POST | `billable.item.create` + `billable.price.create` (+ `billable.cost.create` for `MARKUP`) | Create with `selfPay: { basis: MANUAL, amount } \| { basis: MARKUP, percent, cost: { packCost, unitsPerPack, source? } }` and `reason` |
| `/billable-items` | GET | `billable.view` | List; filter `categoryId`, `kind`, `status`, `search` (code/name); `limit`/`offset`; each with its current self-pay price |
| `/billable-items/:id` | GET | `billable.view` | Detail with category and current price list |
| `/billable-items/:id` | PATCH | `billable.item.update` | `code`, `name`, `description`, `unit`, `categoryId` (same kind), `status` |
| `/billable-items/:id/prices` | POST | `billable.price.create` | New line: `payerId?`, `basis`, `amount?`, `percent?`, `agreementId?`, `effectiveFrom?`, `reason` |
| `/billable-items/:id/prices` | GET | `billable.view` | Line history; filter `payerId` (`self` for self-pay) |
| `/billable-items/:id/costs` | POST / GET | `billable.cost.create` / `billable.cost.view` | New cost / cost history |
| `/billable-items/:id/price-list` | GET | `billable.view` | Resolved price for self-pay and every active payer at `at` |
| `/billable-items/:id/quote` | GET | `billable.view` | `ResolvedPrice` for `payerId?` at `at` |
| `/item-prices/:id/end`, `/item-prices/:id/cancel` | POST | `billable.price.end` / `billable.price.cancel` | End a payer line (`effectiveTo?`, `reason`) / withdraw a scheduled line |
| `/item-costs/:id/end`, `/item-costs/:id/cancel` | POST | `billable.cost.end` / `billable.cost.cancel` | End / withdraw a cost (§5.3) |
| `/payers/:id/agreements` | POST / GET | `billable.agreement.create` / `billable.view` | Add / list agreements |
| `/payer-agreements/:id` | GET / PATCH | `billable.view` / `billable.agreement.update` | Detail with its lines / correct details |
| `/payers/:id/discounts` | POST / GET | `billable.discount.create` / `billable.view` | Add a dated default discount / history |
| `/payer-discounts/:id/end`, `/payer-discounts/:id/cancel` | POST | `billable.discount.end` / `billable.discount.cancel` | End / withdraw a discount |
| `/payers/:id/tariff` | GET | `billable.view` | The payer's resolved price for every active item at `at`; filter `categoryId`, `source`, `search`; paginated |

`at` defaults to now. A future `at` shows scheduled prices. A past one answers "what was it on
15 December".

Code lives in its own top-level `BillablesModule` (`src/billables/`: categories, items, prices,
costs, agreements, `pricing.rules.ts` + `pricing.rules.spec.ts`). Billing will import it to price
charges; it imports nothing from Billing, so the dependency runs one way. DTOs and enum mirrors go in
`src/shared/contracts/billables` and `src/shared/enums/billables`.

## 12. Changes to Existing Models and Code

**In this slice:**

| Current | Becomes |
|---|---|
| — | `BillableCategory`, `BillableItem`, `ItemCost`, `ItemPrice`, `PayerAgreement`, `PayerDiscount`; enums `CatalogStatus`, `PriceBasis`, `PriceSource` |
| `ServiceCategory` | Gains `CONSUMABLE` (Prisma enum and `src/shared/enums/billing/billing.enums.ts`) |
| `Organization` | Gains `billableCategories`, `billableItems` relations |
| `Payer` | Gains `itemPrices`, `agreements`, `discounts` relations. No new columns |
| `permissions.catalog.ts` | §10 `billable.*` keys; seeded profiles updated as in §10 |
| Migration | Prisma-generated tables + appended SQL from §5.1, §6.2 and §8.1 (`btree_gist`, exclusion and CHECK constraints) |

**Charge posting is not touched.** Nothing that posts charges today (registration, consultation at
check-in, `/charges`) reads the catalog in this slice.

**In the later charge-integration slice** (specified here so the catalog is built to fit it, not
built now):

| Current | Becomes |
|---|---|
| `Charge` | Gains `billableItemId` and the §9.2 snapshot (`pricingBasis`, `priceSource`, `itemPriceId`, `agreementId`, `payerDiscountId`, `itemCostId`, `percent`). `unitPrice` and `category` stay as snapshots |
| `Charge.quantity Int` | `Decimal @db.Decimal(12, 3)`: 2.5 bed-days, 7.5 ml. Quantity is a count, not money. `amount = round_half_up(quantity × unitPrice, 2)` (D12) |
| `Organization.registrationFee`, `nfcCardFee`, `consultationFee` | Seeded `systemKey` items (`REGISTRATION_FEE`, `CARD_FEE`, consultation items) priced from the current values; the columns are then removed |
| `ConsultationType` | Replaced by consultation billable items |
| Charge pricing date | The service date: when the charge is incurred (bill at point of use), so a visit spanning a price change prices each charge at its own date |

## 13. Worked Example

Consultation item `CONS-GOPD` (category "Consultations", kind `CONSULTATION`) with the timeline in
§6.3. Ceftriaxone 1g vial `DRG-CEF1` (category "Antibiotics", kind `PHARMACY`): cost ₦1,234.50 per
pack of 100, self-pay `MARKUP` 30%; AXA has a `MARKUP` 20% line under AXA-TRF-2027. Full Blood
Count `LAB-FBC`: self-pay `MANUAL` 4,500.00. AXA has a 10% default discount; Hygeia has none;
Dangote (corporate) has a `DISCOUNT` 15% line on `LAB-FBC`.

| Request (2027-01-05 unless stated) | Price | Basis · source | Rows recorded |
|---|---|---|---|
| `CONS-GOPD`, self-pay | 20,000.00 | `MANUAL` · `SELF_PAY` | self-pay line |
| `CONS-GOPD`, Hygeia | 15,000.00 | `TARIFF` · `PAYER_LINE` | Hygeia line, HYG/2026/014 |
| `CONS-GOPD`, AXA, 2026-12-15 | 12,000.00 | `TARIFF` · `PAYER_LINE` | AXA 2026 line, AXA-TRF-2026 |
| `CONS-GOPD`, AXA | 14,500.00 | `TARIFF` · `PAYER_LINE` | AXA 2027 line, AXA-TRF-2027 |
| `DRG-CEF1`, self-pay | 16.05 | `MARKUP` · `SELF_PAY` | self-pay line, cost row (1,234.50 ÷ 100 × 1.30 = 16.0485) |
| `DRG-CEF1`, AXA | 14.81 | `MARKUP` · `PAYER_LINE` | AXA line, cost row (1,234.50 ÷ 100 × 1.20 = 14.814) |
| `DRG-CEF1`, self-pay, after cost moves to ₦1,500.00/100 | 19.50 | `MARKUP` · `SELF_PAY` | self-pay line, new cost row. No price row changed |
| `LAB-FBC`, Dangote | 3,825.00 | `DISCOUNT` · `PAYER_LINE` | Dangote line, self-pay line (4,500 × 0.85) |
| `LAB-FBC`, AXA | 4,050.00 | `DISCOUNT` · `PAYER_DISCOUNT` | AXA discount row, self-pay line (4,500 × 0.90) |
| `LAB-FBC`, Hygeia | 4,500.00 | `MANUAL` · `SELF_PAY` | self-pay line: a gap in Hygeia's tariff |
| anything, AXA deactivated | — | fails: *payer inactive* | AXA's rows still listed in history |

Later, at charge time (not this slice): a Hygeia Basic member covered for consultation up to
₦10,000 gets the 15,000.00 `TARIFF` price, split by allocation into Hygeia 10,000 + patient 5,000.

## 14. Why / Where / Why Not

- **Why prices hang off the payer, not the plan.** The hospital negotiates one tariff with each
  payer. Plans within a payer differ in what they cover and the limits, not in what the hospital
  charges. Putting price on the plan would mean entering the same tariff once per plan.
- **Why discounts are only ever off self-pay.** If one payer's price could be based on another's,
  a change to NHIA's tariff would silently reprice AXA, and chains could loop. One base keeps every
  price traceable in a single step.
- **Why basis and source are recorded separately.** Basis says how the number was calculated;
  source says which rule supplied it. "Hygeia was charged our own price because it has no line"
  is only visible with both.
- **Why cost per pack.** It keeps all stored money in naira and kobo, matches the supplier invoice,
  and rounds once (§5.2).
- **Why dated rows instead of an audit log.** With an audit log, "the price on 15 December" means
  replaying changes. With dated rows it's one indexed lookup, and the row id is direct evidence in
  a tariff dispute.
- **Why no backdating.** A backdated price would contradict charges already posted at the old
  price. A genuine error in a past bill is corrected through an `ADJUSTMENT` request (`10` §8),
  which leaves its own trail.
- **Why the exclusion constraints.** Two overlapping rows would make "the price on this date"
  ambiguous. The service checks first, but the database guarantees it, including under concurrent
  edits.
- **Why cost has its own view permission.** Price is public to the hospital's staff; cost and
  margin are commercial information.

## 15. Explicitly Out of Scope for v1

- **Charge posting from the catalog** (§12 later slice).
- **Drug details, stock and batches**, and how batch cost feeds `ItemCost` (§4.3, drugs PRD).
- **Coverage, per-service caps and exclusions** ("consultation up to ₦20,000 on Silver"). Plans and
  the insurance PRD; the catalog only supplies the price.
- **Capitation.** A settlement arrangement for the insurance PRD, not a price.
- **Branch-specific prices.** Prices are organisation-wide.
- **Bulk import** (an HMO's tariff sheet, a supplier price list). Builds on the single-row
  endpoints here.
- **Packages / bundles** (e.g. an antenatal package priced as one item covering several services).

## 16. Open Decisions

- **Category-level payer lines** ("all lab tests 10% off for Hygeia"): a level between the payer's
  item line and its default discount, if HMOs commonly negotiate by category.
- **Branch-specific prices.** A chain whose branches charge differently would need `branchId?` on
  `ItemPrice` and one more resolution step. Deferred until a customer needs it.
- **Bulk import formats** for HMO tariff sheets and supplier price lists, once real ones have been
  seen.
