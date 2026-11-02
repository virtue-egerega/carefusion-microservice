# Feature PRD — Inventory: Drugs & Consumables

Status: Draft · Last updated: 2026-11-02
Depends on: `02-hospital-onboarding.md` (`Organization`, `Branch`), `05-access-control-clinical-scoping.md`
(`Permission`, `DutyProfile`), `12-billables-and-price-catalog.md` (`BillableItem`, `ItemCostPrice`,
`ServiceCategory`).
Answers: `12` §4.3 (drug details, stock and batches; how batch cost feeds `ItemCostPrice`) and `04` §3
("pharmacy stock management is a data-management concern owned by the Pharmacy & Inventory PRD").

This document defines how the hospital puts stock into the system and keeps track of it: what it
stocks, the unit it sells it in and the unit it buys it in, which batch and expiry each quantity
belongs to, where it's kept, what it cost, and every event that changes how much there is. **Every
stocked billable uses the same system**: drugs, consumables (gloves, syringes, dressings) and anything else the hospital buys and
holds (eye glasses, implants).

It does **not** cover dispensing, prescriptions or medication administration. Those are the
Dispensing PRD, which takes stock out through the issue contract in §12 and posts charges the way
`13` describes. Inventory never posts a charge.

**Terminology.**
- *Medicine*: the medicine itself, the same in every hospital: "Paracetamol, tablet, oral".
  System reference data, seeded by CareFusion (§3.1).
- *Item* (or *product*): a `BillableItem` (`12` §4), the hospital's own product: "Emzor
  Paracetamol 500mg". Stock is always held against an item; a drug item names its medicine.
- *Selling unit*: the item's `sellingUnit` ("bottle", "card", "vial", "pair"), what one quantity
  sold to a patient means. The item's selling price is the price of one selling unit, and every stock
  quantity is counted in selling units: whole ones, or halves where the product allows it (§4).
- *Purchase unit*: what the product is bought in ("Carton", "Cup"), holding a fixed number of
  selling units (`sellingUnitsPerPurchaseUnit`). One per product: a carton of 12 and a carton of 24
  are two products.
- *Batch*: a manufacturer's production lot of an item (batch number, expiry).
- *Pharmacy unit*: a branch's store or a dispensary, holding and counting its own stock (§7).
- *Balance*: how much of one batch sits in one pharmacy unit in one status.
- *Movement*: a signed change to one balance. A *stock transaction* groups the movements of one
  event (a receipt, a transfer, a write-off).

## 1. Decisions Record

Agreed during design review, 2026-10-23. Rows marked *(proposed)* are recommendations awaiting
confirmation (§24).

| # | Decision | § |
|---|---|---|
| D1 | **One inventory system for every stocked billable.** Stock tracking is a 1:1 extension of `BillableItem` (`StockItem`), opt-in per item, for any category kind. | 3 |
| D1a | **Medicines are system reference data.** `Medicine` (generic name, one dosage form, one route; aliases, ingredients, therapeutic uses, body systems) is seeded by CareFusion; a hospital may add one that's missing, marked `USER_ADDED` and visible only to itself. Strength, brand, maker and NAFDAC number belong to the hospital's product, its `StockItem`, which names its medicine; `PHARMACY`-kind items must. Therapeutic uses are a short list built from the medicines data, for finding medicines, not an ATC tree. *(2026-10-24)* | 3 |
| D2 | **Stock is counted in selling units; a product has one purchase unit.** The product records its selling unit ("bottle"), its purchase unit ("Carton") and how many selling units the purchase unit holds (24), fixed once it has stock. A different pack size is a different product. Quantities are whole selling units, or halves (never any other fraction) where the product is `sellableInHalves`. *(2026-11-02, replaces packs)* | 4 |
| D3 | **Supplier and manufacturer are separate, and learnt while working.** A supplier sells to the hospital; the manufacturer belongs to the product (Emzor Paracetamol and M&B Paracetamol are two products, two prices). Neither is set up in advance: a typed name on a receipt or product is matched (case and spacing ignored) or created, then picked next time. Categories are picked or created the same way when a product is added. *(2026-11-02)* | 3, 5 |
| D4 | **A batch is identified by product + batch number**, and can arrive in several deliveries. Expiry belongs to the batch; a later delivery that disagrees is rejected. | 6 |
| D5 | **Stock is held in pharmacy units: a branch's store and its dispensaries.** Every branch is created with its Main Pharmacy Store. A unit has no storage condition (that's the product's); a product may carry a `shelfNumber`. Shelves and fridges as counted units can be added later without breaking anything. *(2026-11-02)* | 7 |
| D6 | **Balances are keyed by location + batch + status.** Status is `AVAILABLE`, `QUARANTINE` or `DAMAGED` (`IN_TRANSIT` arrives with transfers). Batch-wide quality (`RELEASED`, `ON_HOLD`, `RECALLED`) sits on the batch; expiry is computed from the date, never flagged by a job. | 8 |
| D7 | **Movements are the only writer of balances.** Movements are append-only; a database trigger applies each one to its balance, and `CHECK (sellingUnitQuantity >= 0)` rejects any overdraw. | 9 |
| D8 | **Receiving records what actually arrived**: purchase units delivered vs accepted per product, each naming its batch. Only accepted purchase units enter stock (× the product's selling units per purchase unit), optionally into quarantine. The supplier's invoice is kept as photos on the receipt. | 10 |
| D9 | **One selling price per selling unit, set by the hospital, warned against cost.** The item's selling price is per selling unit, not per batch. Posting a receipt rolls the item's `ItemCostPrice` forward when the cost per selling unit changed (on by default, off per line *(proposed)*); batch cost is kept for valuation. Setting a selling price below the cost price per selling unit, or a receipt that pushes the cost price above the selling price, returns a warning, never a block. *(2026-11-02)* | 11 |
| D10 | **The pharmacy names the batch; the system never picks one.** Every line of stock leaving a unit (issue, transfer, write-off) carries its `batchId`: what was physically taken out. FEFO (first expiry, first out) is only the order usable batches are offered in, soonest expiry first, so staff know what to take out first. *(2026-11-02, replaces automatic FEFO)* | 12 |
| D11 | **Moves never change the total.** A transfer between locations or branches is dispatch then receive, with the quantity `IN_TRANSIT` in between. | 13 |
| D12 | **Quantity-changing corrections are maker-checker.** *(proposed)* Adjustments, write-offs and count variances need an approver other than the requester. Value thresholds come later. | 14 |
| D13 | **Inventory is its own module** (`src/inventory/`), importing Billables; neither Billables nor Billing imports it. The existing `src/pharmacy/` stub is left for Dispensing. Permissions and routes are named for the pharmacy, which manages all drugs and consumables in a hospital: `pharmacy.*` keys, `/api/pharmacy` paths *(2026-10-25)*. | 19 |

## 2. What Problem This Solves

A hospital pharmacy isn't a product with a stock number. The same amoxicillin arrives in several
lots with different expiry dates and prices, sits partly in the main store and partly in the OPD
dispensary fridge, some of it waiting for inspection, some of it recalled. Without that structure the
hospital can't:

- **Rotate stock**: issue the lot that expires first, and see what is about to expire.
- **Recall**: find every unit of lot `A123` and stop it being issued, everywhere, at once.
- **Account for stock**: explain any balance from its movements, value it at what was paid, and
  know who wrote off what and why.
- **Price drugs at market**: `12` prices drugs and consumables as cost + markup; something has to
  keep cost current as deliveries arrive.

## 3. Stocked Items

### 3.1 `Medicine` (system reference data)

The medicine itself, as staff look for it: generic name, strength, one dosage form, one route.
Paracetamol tablet and paracetamol suspension are two medicines, and so are Allopurinol 100 mg and
300 mg tablets: NHIA lists each strength as its own line with its own code, and doctors prescribe a
strength. Medicines are the same in every hospital, so CareFusion seeds them, like clinics and queues (`04`).

The goal is **finding medicines**, not teaching pharmacology: search by name, strength, alias or
ingredient, filter by therapeutic use, form, route and body system.

```prisma
model Medicine {
  id             String           @id @default(uuid())
  organizationId String?          // null = seeded by CareFusion; set = added by that hospital (USER_ADDED)
  genericName    String           // "Paracetamol", "Artemether + Lumefantrine"
  strength       String?          // "500 mg", "250 mg/5 ml"; display text, part of identity
  dosageForm     DosageForm
  route          MedicineRoute
  ingredients    String[]         @default([])
  aliases        String[]         @default([]) // other names staff search by: "Acetaminophen", "PCM"
  bodySystems    MedicineBodySystem[] @default([])
  atcCode        String?          // the medicine's own WHO ATC code, kept as given
  legalCategory  LegalCategory    @default(POM)
  controlled     Boolean?         // null = the source doesn't say
  presentation   String?          // "Vial", "Ampoule"
  nhisCode       String?          // NHIA drug list code: one per strength line
  description    String?
  sourceSystem   String?          // "NHIA_MEDICINES_LIST"
  sourceUrl      String?
  searchText     String           @default("") // name + strength + aliases + ingredients, kept by a trigger
  status         CatalogStatus    @default(ACTIVE)
  createdAt      DateTime         @default(now())
  createdBy      String?          // null for seeded rows
  updatedAt      DateTime         @updatedAt
  updatedBy      String?

  organization    Organization?            @relation(fields: [organizationId], references: [id])
  therapeuticUses MedicineTherapeuticUse[]
  stockItems      StockItem[]
}

// What a medicine is used for, as staff ask for it: "Pain", "General anaesthesia". Built from the
// medicines data: the seeder creates a use the first time a medicine names its code.
model TherapeuticUse {
  id        String   @id @default(uuid())
  code      String   @unique // "GENERAL_ANAESTHESIA"
  name      String           // "General anaesthesia"
  medicines MedicineTherapeuticUse[]
}

model MedicineTherapeuticUse {
  medicineId String
  useId      String
  medicine   Medicine       @relation(fields: [medicineId], references: [id], onDelete: Cascade)
  use        TherapeuticUse @relation(fields: [useId], references: [id])

  @@id([medicineId, useId])
  @@index([useId])
}

enum LegalCategory { POM P OTC }   // prescription only, pharmacy, over the counter
```

`DosageForm` (63 values, e.g. `TABLET`, `FILM_COATED_TABLET`, `ORAL_SUSPENSION`, `SOLUTION`,
`INFUSION`, `SOLUTION_FOR_INFUSION`, `INHALATION_LIQUID`, `MEDICINAL_GAS`), `MedicineRoute` (22, the
specific routes plus WHO's coarser `PARENTERAL`, `OROMUCOSAL`, `INSTILLATION`, `IMPLANT`) and
`MedicineBodySystem` (the 16 BNF chapters plus `EAR`, `RENAL`, `AUTONOMIC_NERVOUS_SYSTEM`, `IMMUNESYSTEM` and `DIGESTIVE_SYSTEM`; separate from the consultation `BodySystem`) are listed in `prisma/schema.prisma`. Solution, infusion and
solution for infusion are three different forms.

```sql
-- one medicine per owner; seeded rows share the null owner
CREATE UNIQUE INDEX "Medicine_identity" ON "Medicine" ("organizationId", lower("genericName"), lower("strength"), "dosageForm", "route")
  NULLS NOT DISTINCT;
-- searchText = lower(name + strength + aliases + ingredients), set on every insert and update; trigram-indexed
CREATE INDEX "Medicine_search_trgm" ON "Medicine" USING gin ("searchText" gin_trgm_ops);
```

- **Seeded** from `prisma/data/medicines/medicines-*.json` (`prisma/seed.ts`), `organizationId`
  null. Hospitals can't edit or deactivate seeded rows. The seeder is insert-only: re-running adds
  medicines that aren't there yet and leaves existing ones alone.
- **One entry is one medicine.** Each strength is its own entry with its own NHIS code; an entry with
  the same name and strength (any case), form and route as another is reported as a duplicate. A
  medicine with no strength (a medical gas) leaves it out. *(2026-10-25: strength moved from the
  product to the medicine.)*
- **A hospital can add a medicine that's missing** (`pharmacy.medicine.manage`). It's shown as
  `USER_ADDED` and visible only to that hospital. It's refused (409) if it matches a seeded medicine
  or one of the hospital's own. It picks therapeutic uses from the list; it can't invent new ones.
- **When CareFusion later seeds a medicine a hospital already added**, the seeder adds it as usual (it never
  touches hospital rows), so the hospital briefly sees both. The hospital's copy then carries
  `seededMatch: { id }` in list and detail responses, and `POST /medicines/:id/merge` moves every product
  naming the copy onto the seeded medicine and marks the copy `INACTIVE`, in one transaction. A merge is the
  hospital's decision, so nothing is moved without it.
- **Prescribing and dispensing will work against the medicine.** A doctor prescribes paracetamol
  500 mg tablet, oral; dispensing offers every product in stock that names it, whatever the brand.
- **`controlled` can be unknown.** The NHIA list doesn't say, and guessing `false` would be wrong
  for ketamine, so it stays null until set.

### 3.2 `StockItem` (the hospital's product)

What the hospital actually stocks: "Emzor Paracetamol 500mg, sold by the card, bought in cartons of
10 cards". It is recorded **before** the hospital decides a selling price, because the price is
judged against the cost price of one selling unit, and that needs the selling unit and the purchase
unit first. The brand and maker belong here, because Emzor Paracetamol and M&B Paracetamol are two
products with two prices and two sets of batches.

```prisma
model StockItem {
  itemId                      String           @id
  organizationId              String
  medicineId                  String?          // required for PHARMACY-kind items; its strength is the product's
  brandName                   String?          // "Emzor Paracetamol"
  manufacturerId              String?          // the maker identifies the product, not the batch (§5)
  registrationNo              String?          // NAFDAC registration number
  shelfNumber                 String?          // where it sits in the pharmacy, if the hospital labels shelves: "B3"
  purchaseUnitName            String           // "Carton", "Cup": what the product is bought in (§4)
  sellingUnitsPerPurchaseUnit Int              // 24 bottles in the carton; fixed once the product has stock
  sellableInHalves            Boolean          @default(false) // true: half a selling unit (half a card) may be issued
  batchTracked                Boolean          @default(true)  // batch number + expiry required on receipt
  quarantineOnReceipt         Boolean          @default(false) // receipt items default to QUARANTINE
  storageCondition            StorageCondition @default(ROOM_TEMPERATURE)
  createdAt                   DateTime         @default(now())
  createdBy                   String
  updatedAt                   DateTime         @updatedAt
  updatedBy                   String?

  item                        BillableItem     @relation(fields: [itemId, organizationId], references: [id, organizationId])
  medicine                    Medicine?        @relation(fields: [medicineId], references: [id])
  manufacturer                Manufacturer?    @relation(fields: [manufacturerId], references: [id])
  batches                     StockBatch[]
  receiptItems                GoodsReceiptItem[]

  @@unique([itemId, organizationId]) // target of StockBatch's composite FK
  @@index([organizationId])
  @@index([medicineId])
  @@index([manufacturerId])
}

enum StorageCondition {
  ROOM_TEMPERATURE // 15–25 °C
  COOL             // 8–15 °C
  REFRIGERATED     // 2–8 °C
  FROZEN
}
```

```sql
ALTER TABLE "StockItem" ADD CONSTRAINT stock_item_selling_units_per_purchase_unit_positive
  CHECK ("sellingUnitsPerPurchaseUnit" > 0);
```

### 3.3 Adding a product

`POST /pharmacy/items` (`pharmacy.item.manage`) records the product in one transaction: the
`BillableItem` (category, code, name, `sellingUnit`) and its `StockItem` (medicine, brand, maker,
NAFDAC number, shelf number, purchase unit, selling units per purchase unit, halves, storage).

- **The pharmacist categorises the product here.** `categoryId` picks one of the hospital's billable
  categories ("Antibiotics", "Analgesics"), or `category: { name }` creates it on the spot, matched by
  name first (§5's matching), so it's picked from the list next time. A created category gets kind
  `PHARMACY` for a product that names a medicine and `CONSUMABLE` for one that doesn't; a picked one
  must already have that kind. The category is the product's place on the price list and the charge
  category on the bill (`12` §4); therapeutic uses (§3.1) stay on the medicine, for finding it.
- **The manufacturer** is `manufacturerId`, or `manufacturer: { name, country? }` matched or created
  the same way (§5).
- **`shelfNumber`** is optional free text ("B3", "Fridge 2, top"), for hospitals that label shelves.
  It's shown on stock screens and pick lists; it is not a location and holds no stock (§7.1).

**No selling price
is needed**: the item simply can't be charged until it has one (`12` §9.1 refuses an item with no
self-pay line), and the stock screens list it as *no selling price*. A price can be given on the same
call (`sellingUnitPrice` + `reason`, a self-pay `MANUAL` line), or added later through Billables once
the first receipt shows the cost price (§11). This is the one way to create a billable item without
its first self-pay line (`12` §4.2), along with a goods receipt item's `newProduct` (§10.2), which
creates the product the same way.

An item already in the catalogue (a consumable added through Billables) is made stocked with
`PUT /pharmacy/items/:itemId`, which takes the same stock fields.

### 3.4 Rules

- **Opt-in, any kind.** Any item can be stocked; in practice `PHARMACY` and `CONSUMABLE`. A
  `PHARMACY`-kind stocked item **must** name a medicine; other kinds can't. Moving an item between
  categories is same-kind only (`12` §4.2), so this can't drift.
- **The medicine must be a seeded one or the caller's own.** The service checks this; a foreign key
  can't, since seeded rows have no organisation.
- **Strength comes from the medicine.** Emzor Paracetamol 500 mg names the Paracetamol 500 mg tablet
  medicine; Emzor Paracetamol 1 g names the 1 g one. The product has no strength of its own to disagree.
- **Name and code stay on the item.** `BillableItem.name` is what staff search and what charges
  snapshot ("Amoxil 125mg/5ml Suspension, carton of 24"); the medicine supplies the structured parts.
- **The manufacturer is picked from the hospital's list** (§5), or created on the spot, like a
  supplier. It must be the caller's own and active.
- **Can't be un-stocked** once it has a movement. Deactivate the item instead (`12` §4.2).
- **The units are fixed once the product has a movement**: `BillableItem.sellingUnit`,
  `purchaseUnitName`, `sellingUnitsPerPurchaseUnit` and `sellableInHalves` can't change, because each
  would silently change what every balance means. A hospital that starts buying a different carton
  size, or selling by the tablet instead of the card, adds a new product. This is a new rule on
  `PATCH /billables/items/:id` (§19) and on `PUT /pharmacy/items/:itemId`.
- **`batchTracked = false`** (e.g. eye glasses, some consumables): batch number and expiry are
  optional. Each receipt item still creates a batch row (with no number), so the ledger has one
  shape for everything and stock rotates first-in, first-out.

## 4. Selling Unit and Purchase Unit

Every stocked product answers these questions once, when it's added:

| Question | Column | Amoxil syrup (carton of 24) | Amoxil syrup (carton of 12) | Emzor PCM 500mg |
|---|---|---|---|---|
| What is one quantity sold? | `BillableItem.sellingUnit` | bottle | bottle | card |
| What is it bought in? | `StockItem.purchaseUnitName` | Carton | Carton | Carton |
| How many selling units in one purchase unit? | `StockItem.sellingUnitsPerPurchaseUnit` | 24 | 12 | 10 |
| Can half a selling unit be issued? | `StockItem.sellableInHalves` | no | no | yes |

- **The purchase unit is always counted in the product's selling unit.** A receipt never enters its
  own conversion: it copies the product's, so a carton can't be recorded as 20 bottles on one
  delivery and 24 on the next.
- **One purchase unit per product.** Amoxil in cartons of 12 and Amoxil in cartons of 24 are two
  products, entered separately, with their own batches and their own (possibly equal) selling price.
  Both name the same medicine, so "how much Amoxicillin 125 mg/5 ml do we have" adds them: 50 cartons
  × 24 + 1 carton × 12 = **1,212 bottles** (§8.2).
- **Stock is counted in selling units.** A receipt adds `purchaseUnitsAccepted ×
  sellingUnitsPerPurchaseUnit`; issues, transfers, counts and adjustments all move selling units.
- **Whole or half, nothing else.** Every quantity is a multiple of 0.5 (database CHECK), and a half
  is accepted only for a product that is `sellableInHalves` (service check, since the flag lives on
  another table). Half a card, one card, one and a half cards, or the whole carton (10 cards) are all
  quantities of the one selling unit; 0.8 of a card is always rejected.
- **The cost price of one selling unit** is `purchaseUnitCost ÷ sellingUnitsPerPurchaseUnit`: a
  carton at ₦50,000.00 holding 24 bottles costs **₦2,083.33** a bottle. It is worked out, never stored
  (§11, `12` §5.2).

## 5. Suppliers and Manufacturers

```prisma
model Supplier {
  id             String        @id @default(uuid())
  organizationId String
  name           String
  contactName    String?
  phone          String[]
  email          String?
  address        String?
  taxId          String?       // TIN
  notes          String?
  status         CatalogStatus @default(ACTIVE)
  createdAt      DateTime      @default(now())
  createdBy      String
  updatedAt      DateTime      @updatedAt
  updatedBy      String?

  organization   Organization  @relation(fields: [organizationId], references: [id])
  receipts       GoodsReceipt[]
}

model Manufacturer {
  id             String        @id @default(uuid())
  organizationId String
  name           String        // "Emzor Pharmaceutical Industries"
  country        String?
  status         CatalogStatus @default(ACTIVE)
  createdAt      DateTime      @default(now())
  createdBy      String
  updatedAt      DateTime      @updatedAt
  updatedBy      String?

  organization   Organization  @relation(fields: [organizationId], references: [id])
  stockItems     StockItem[]
}
```

```sql
-- one supplier / manufacturer per name per hospital, whatever the case or spacing
CREATE UNIQUE INDEX "Supplier_name" ON "Supplier" ("organizationId", lower(btrim("name")));
CREATE UNIQUE INDEX "Manufacturer_name" ON "Manufacturer" ("organizationId", lower(btrim("name")));
```

- **Nobody sets them up in advance.** Suppliers are learnt from receipts and manufacturers from
  products: a receipt takes `supplierId` **or** `supplier: { name, phone?, email? }`, a product takes
  `manufacturerId` **or** `manufacturer: { name, country? }`. A name is matched to the hospital's
  existing row ignoring case and surrounding spaces, or a new row is created, in one
  insert-on-conflict against the unique index (no lookup first). The next receipt picks it from the
  list. `POST /pharmacy/suppliers` and `/manufacturers` remain for adding one ahead of time.
- **Matching never edits.** A name that matches an existing supplier uses it as it is; phone or email
  sent with it are ignored, and details are changed with `PATCH /pharmacy/suppliers/:id`.
- The same matching creates billable categories from `POST /pharmacy/items` (§3.3). For that,
  `BillableCategory`'s `@@unique([organizationId, name])` becomes the same case- and space-blind
  index, `"BillableCategory_name" ON ("organizationId", lower(btrim("name")))` (§19).
- **A supplier is not the manufacturer.** A distributor sells Emzor's paracetamol; the maker is on
  the product (§3.2), not the batch: one product has one maker.
- **A supplier is not a `Payer`.** Payers owe the hospital; suppliers are owed by it. Supplier
  ledgers (payables) are out of scope (§23).
- Deactivated suppliers can't receive new receipts or orders, and deactivated manufacturers can't be
  set on a product; their history stays.

## 6. Batches

```prisma
model StockBatch {
  id               String       @id @default(uuid())
  organizationId   String
  itemId           String
  batchNumber      String?      // null only for items that aren't batch-tracked
  manufacturedOn   DateTime?    @db.Date
  expiryDate       DateTime?    @db.Date // required for batch-tracked items; expired from the day after
  qualityStatus    BatchQuality @default(RELEASED)
  qualityReason    String?
  qualityChangedAt DateTime?
  qualityChangedBy String?
  recallReference  String?      // required when RECALLED
  firstReceivedAt  DateTime     // FIFO tie-break; rotation order for untracked items
  createdAt        DateTime     @default(now())
  createdBy        String

  stockItem        StockItem    @relation(fields: [itemId, organizationId], references: [itemId, organizationId])
  balances         StockBalance[]
  movements        StockMovement[]
  receiptItems     GoodsReceiptItem[]

  @@unique([itemId, batchNumber]) // nulls distinct: every untracked receipt line gets its own batch
  @@unique([id, organizationId])
  @@index([itemId, expiryDate])
}

enum BatchQuality {
  RELEASED // usable
  ON_HOLD  // under investigation; reversible
  RECALLED // terminal; stock leaves by write-off or supplier return
}
```

```sql
ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_dates_valid
  CHECK ("manufacturedOn" IS NULL OR "expiryDate" IS NULL OR "expiryDate" > "manufacturedOn");
ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_recall_reference
  CHECK ("qualityStatus" <> 'RECALLED' OR "recallReference" IS NOT NULL);
```

### 6.1 Rules

- **A lot is product + batch number.** The product already names its maker (§3.2), so two makers'
  lots can't collide.
- **Created by receiving** (§10), never directly. A second delivery of the same lot matches the
  existing row. If its expiry or manufacture date disagree with the row, the receipt is rejected
  naming the line: one lot has one expiry, and the mismatch is a data-entry error to resolve, not
  overwrite.
- **Expiry is a date.** When the label shows only a month ("EXP 03/2027"), the UI stores the last day
  of that month. Stock is **expired from the day after** its expiry date.
- **Batch number and expiry are corrected only through a request** while the batch has no movement
  other than its receipt; afterwards they're fixed (§24).
- **Quality applies everywhere at once.** Putting a batch `ON_HOLD` or `RECALLED` makes every unit
  of it ineligible (§8.2) in every location, with no movement. `RECALLED` is terminal and needs a
  `recallReference`.

## 7. Pharmacy Units

A **pharmacy unit** is a place in a branch that holds and counts its own stock: the branch's **store**
(deliveries arrive there, bulk stock is kept) or a **dispensary** (OPD, inpatient, emergency) that
medicines reach patients from, topped up from the store (§13). It is not a storage condition: one store
keeps fridge drugs and room-temperature drugs side by side, so the condition belongs to the product
(`StockItem.storageCondition`) and where it sits in the unit to the product's `shelfNumber`.

```prisma
model PharmacyUnit {
  id                String           @id @default(uuid())
  organizationId    String
  branchId          String
  code              String           // "STORE-MAIN", "OPD-DISP"
  name              String           // "Main Pharmacy Store", "OPD Dispensary"
  type              PharmacyUnitType
  status            CatalogStatus    @default(ACTIVE)
  createdAt         DateTime         @default(now())
  createdBy         String?          // null = created with its branch (§7.1)
  updatedAt         DateTime         @updatedAt
  updatedBy         String?

  organization      Organization     @relation(fields: [organizationId], references: [id])
  branch            Branch           @relation(fields: [branchId], references: [id])
  balances          StockBalance[]
  movements         StockMovement[]
  goodsReceipts     GoodsReceipt[]
  goodsReceiptItems GoodsReceiptItem[]

  @@unique([organizationId, code])
  @@unique([id, organizationId]) // target of balance and movement composite FKs
  @@index([organizationId, branchId])
}

enum PharmacyUnitType {
  STORE      // receives deliveries, holds bulk stock
  DISPENSARY // hands medicines to patients; topped up from the store
}
```

### 7.1 Rules

- **Every branch comes with its store.** Onboarding (the main branch) and adding a branch create
  **"Main Pharmacy Store"** (`STORE`, code `STORE-<branch code>`, `createdBy` null) in the same
  write; the seeder adds one to any existing branch without a store, insert-only. A goods receipt's
  `pharmacyUnitId` is optional and defaults to the branch's store; with several stores it must be
  given. Nobody has to create a unit before the first delivery; dispensaries are added when the
  hospital sets them up.
- **Store or dispensary in v1.** Wards, theatres and clinics holding stock arrive with requisitions
  (§23). *(2026-11-02: storage locations became pharmacy units; any unit typed otherwise became a
  dispensary.)*
- **Shelves aren't units.** A product's `shelfNumber` (§3.2: "B3", "Fridge 2") says where to find it;
  stock isn't counted per shelf. Shelves and fridges counted on their own would be a nullable
  `parentId` later, additive.
- **Deactivating** needs the unit to hold no stock (all balances zero). Inactive units take no
  movements.

## 8. Balances, Status and Eligibility

### 8.1 `StockBalance`

```prisma
model StockBalance {
  id             String          @id @default(uuid())
  organizationId String
  branchId       String
  pharmacyUnitId     String
  itemId         String
  batchId        String
  status         StockStatus
  sellingUnitQuantity Decimal     @default(0) @db.Decimal(12, 1) // whole or half selling units
  updatedAt      DateTime        @updatedAt

  pharmacyUnit   PharmacyUnit @relation(fields: [pharmacyUnitId, organizationId], references: [id, organizationId])
  batch          StockBatch      @relation(fields: [batchId, organizationId], references: [id, organizationId])

  @@unique([pharmacyUnitId, batchId, status])
  @@index([organizationId, itemId, status])
  @@index([batchId])
}

enum StockStatus {
  AVAILABLE
  QUARANTINE // received, awaiting inspection / release
  DAMAGED    // set aside for write-off or supplier return
}
```

Slice 2 adds `IN_TRANSIT` (dispatched to this location, not yet received, §13).

```sql
ALTER TABLE "StockBalance" ADD CONSTRAINT stock_balance_non_negative CHECK ("sellingUnitQuantity" >= 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT stock_balance_whole_or_half
  CHECK ("sellingUnitQuantity" * 2 = trunc("sellingUnitQuantity" * 2));
```

Balances are never written by application code; only the movement trigger (§9.2) writes them. A row
at zero is kept (it's the history's anchor); views filter `sellingUnitQuantity > 0`.

### 8.2 Eligibility

Stock is **eligible** (can be issued, transferred out as usable, or counted as available) when all
hold:

| Check | Source |
|---|---|
| `StockBalance.status = AVAILABLE` | balance |
| `StockBatch.qualityStatus = RELEASED` | batch |
| `expiryDate IS NULL OR expiryDate >= today` | batch, computed at query time |
| location `ACTIVE` | location |
| item `ACTIVE` | `BillableItem` |

**Total stock** of an item is the sum of its balances under whatever location, branch and status
filter the caller asks for. Stock screens show `onHand`, `eligible`, `quarantine`, `damaged`,
`expired` and `onHold/recalled` side by side (and `inTransit` from slice 2).

**By medicine.** Summing over every `StockItem` with the same `medicineId` answers "how much paracetamol
500 mg do we have", whatever the brand.

### 8.3 Status changes

Moving quantity between statuses at the same location is a `STATUS_CHANGE` transaction: one negative
and one positive movement, net zero. Allowed:

| From | To | Meaning | Permission |
|---|---|---|---|
| `QUARANTINE` | `AVAILABLE` | Released after inspection | `pharmacy.stock.release` |
| `AVAILABLE` | `QUARANTINE` | Pulled back for inspection | `pharmacy.stock.status` |
| `AVAILABLE`, `QUARANTINE` | `DAMAGED` | Set aside (broken vial, cold-chain failure) | `pharmacy.stock.status` |

`DAMAGED` stock leaves only by write-off (§14) or supplier return. `IN_TRANSIT` (slice 2) is touched
only by transfers.

## 9. The Ledger

### 9.1 Transactions and movements

```prisma
model StockTransaction {
  id             String               @id @default(uuid())
  organizationId String
  branchId       String
  type           StockTransactionType
  sourceType     String?              // "GoodsReceipt", "Dispensing"…
  sourceId       String?
  reason         String?
  occurredAt     DateTime             @default(now())
  createdBy      String

  branch         Branch               @relation(fields: [branchId], references: [id])
  movements      StockMovement[]
  receipt        GoodsReceipt?

  @@index([organizationId, occurredAt])
  @@index([sourceType, sourceId])
}

model StockMovement {
  id             String           @id @default(uuid())
  transactionId  String
  organizationId String
  pharmacyUnitId     String
  itemId         String
  batchId        String
  status         StockStatus
  sellingUnitQuantity Decimal @db.Decimal(12, 1)     // signed whole or half selling units; never 0
  createdAt      DateTime         @default(now())

  transaction    StockTransaction @relation(fields: [transactionId], references: [id])
  pharmacyUnit   PharmacyUnit  @relation(fields: [pharmacyUnitId, organizationId], references: [id, organizationId])
  batch          StockBatch       @relation(fields: [batchId, organizationId], references: [id, organizationId])

  @@index([transactionId])
  @@index([batchId, createdAt])
  @@index([pharmacyUnitId, itemId, createdAt])
  @@index([itemId, createdAt])
}

enum StockTransactionType {
  OPENING       // opening stock at go-live (+)
  RECEIPT       // goods receipt (+)
  STATUS_CHANGE // net 0 per batch, same location
  ISSUE         // (−) dispensing / ward use, through the issue contract (§12.3)
  ISSUE_RETURN  // (+) unused stock returned to the batches it was issued from
}
```

Later slices add `TRANSFER_DISPATCH` and `TRANSFER_RECEIVE` (net 0 per batch), `ADJUSTMENT` and
`COUNT_VARIANCE` (±, approved) in slice 2, and `SUPPLIER_RETURN` (−) in slice 3.

### 9.2 Integrity, in the database

```sql
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_non_zero CHECK ("sellingUnitQuantity" <> 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_whole_or_half
  CHECK ("sellingUnitQuantity" * 2 = trunc("sellingUnitQuantity" * 2));

-- the only writer of StockBalance
CREATE FUNCTION apply_stock_movement() RETURNS trigger AS $$
BEGIN
  INSERT INTO "StockBalance" ("id", "organizationId", "branchId", "pharmacyUnitId", "itemId", "batchId",
                              "status", "sellingUnitQuantity", "updatedAt")
  SELECT gen_random_uuid()::text, NEW."organizationId", l."branchId", NEW."pharmacyUnitId", NEW."itemId",
         NEW."batchId", NEW."status", NEW."sellingUnitQuantity", now()
  FROM "PharmacyUnit" l WHERE l."id" = NEW."pharmacyUnitId"
  ON CONFLICT ("pharmacyUnitId", "batchId", "status")
  DO UPDATE SET "sellingUnitQuantity" = "StockBalance"."sellingUnitQuantity" + EXCLUDED."sellingUnitQuantity",
                "updatedAt" = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movement_apply AFTER INSERT ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- the ledger is append-only
CREATE FUNCTION reject_stock_movement_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'stock movements are append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_change();

-- status changes (and, from slice 2, transfers) never change the total: checked at commit, per batch
CREATE FUNCTION check_stock_transaction_balanced() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "StockTransaction" t JOIN "StockMovement" m ON m."transactionId" = t."id"
    WHERE t."id" = NEW."transactionId" AND t."type" IN ('STATUS_CHANGE')
    GROUP BY m."batchId" HAVING SUM(m."sellingUnitQuantity") <> 0
  ) THEN RAISE EXCEPTION 'stock transaction % does not balance', NEW."transactionId"; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER stock_transaction_balanced AFTER INSERT ON "StockMovement"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_transaction_balanced();
```

What this buys:

- **Services only insert movements.** No read-then-write of a balance, no race: two people taking
  the last 10 bottles at once both run the trigger's `UPDATE`, and the second fails the
  `sellingUnitQuantity >= 0` CHECK. The service turns that into a 409 *insufficient stock*.
- **Taking from nothing fails too**: a negative movement against a balance row that doesn't exist
  inserts a negative row, which fails the same CHECK.
- **Every balance equals the sum of its movements**, by construction. A reconciliation query
  (`/pharmacy/ledger/check`) proves it on demand.
- **Composite FKs** keep a movement's batch and location in its organisation.
- **`itemId` on the movement and balance** is copied from the batch so stock-by-item queries don't
  join; the service sets it from the batch it already loaded, and the batch FK stops it disagreeing
  in practice (a CHECK across tables isn't possible; the reconciliation query covers it).

### 9.3 Cost of a quantity

Movements store no money. A batch's **cost price per selling unit** is worked out from its receipt
items: `Σ(purchaseUnitCost × purchaseUnitsAccepted) ÷ Σ(purchaseUnitsAccepted ×
sellingUnitsPerPurchaseUnit)`, a weighted average when one lot arrived in several deliveries at
different prices. Value of any quantity = selling units × that cost, **rounded half-up to 2 places
once**, at the end of the sum (`12` D12): 120 bottles from cartons at ₦50,000.00 / 24 are worth
₦250,000.00, not 120 × ₦2,083.33 = ₦249,999.60. Opening stock carries its own cost the same way. This
gives stock valuation and, once Dispensing exists, cost of goods issued, from the same rows.

## 10. Receiving

A supplier delivers goods with an invoice. The **`GoodsReceipt`** is that delivery, recorded once:
supplier, invoice number and date, when it arrived, the store it was received into, and photos of
the invoice. Each product on it is a **`GoodsReceiptItem`**: how many purchase units came and were
accepted, the cost of one purchase unit, the batch number and expiry. Posting the receipt is the
one event that puts the stock in.

### 10.1 `GoodsReceipt`, `GoodsReceiptItem`, `GoodsReceiptAttachment`

```prisma
model GoodsReceipt {
  id                  String          @id @default(uuid())
  organizationId      String
  branchId            String
  number              String                         // "GRN-000123" (SequenceCounter "grn:<orgId>")
  type                ReceiptType     @default(DELIVERY)
  pharmacyUnitId          String                         // where it's received (default: the branch's store, §7.1); items may put away elsewhere in the branch
  supplierId          String?                        // required for DELIVERY
  supplierInvoiceNo   String?
  supplierInvoiceDate DateTime?       @db.Date
  supplierInvoiceTotal Decimal?      @db.Decimal(14, 2)   // the invoice's total as printed (§10.4)
  deliveryNote        String?
  receivedAt          DateTime                       // when the goods physically arrived
  status              ReceiptStatus   @default(DRAFT)
  notes               String?
  transactionId       String?         @unique        // set when posted
  createdAt           DateTime        @default(now())
  createdBy           String
  updatedAt           DateTime        @updatedAt
  updatedBy           String?
  postedAt            DateTime?
  postedBy            String?
  cancelledAt         DateTime?
  cancelledBy         String?
  cancelReason        String?

  organization        Organization     @relation(fields: [organizationId], references: [id])
  branch              Branch           @relation(fields: [branchId], references: [id])
  pharmacyUnit        PharmacyUnit  @relation(fields: [pharmacyUnitId], references: [id])
  supplier            Supplier?        @relation(fields: [supplierId], references: [id])
  transaction         StockTransaction? @relation(fields: [transactionId], references: [id])
  items               GoodsReceiptItem[]
  attachments         GoodsReceiptAttachment[]

  @@unique([organizationId, number])
  @@index([organizationId, status, receivedAt])
  @@index([supplierId, receivedAt])
}

// One product on the delivery, as on the supplier's invoice.
model GoodsReceiptItem {
  id                          String        @id @default(uuid())
  receiptId                   String
  stockItemId                 String                             // the stocked product received (StockItem)
  purchaseUnitName            String                             // copied from the product on save: "Carton"
  sellingUnitsPerPurchaseUnit Int                                // copied from the product on save: 24
  purchaseUnitsDelivered      Int
  purchaseUnitsAccepted       Int                                // only accepted purchase units enter stock
  rejectReason                String?                            // required when fewer accepted than delivered
  purchaseUnitCost            Decimal       @db.Decimal(14, 2)   // cost of one purchase unit, as invoiced
  batchNumber                 String?
  manufacturedOn              DateTime?     @db.Date
  expiryDate                  DateTime?     @db.Date
  putAwayPharmacyUnitId       String?                            // put away in this unit instead of the receipt's (same branch)
  receiveAs                   StockStatus   @default(AVAILABLE)  // AVAILABLE | QUARANTINE
  updateCost                  Boolean       @default(true)       // roll ItemCostPrice forward on posting (§11)
  keepCostReason              String?                            // required when updateCost = false
  batchId                     String?                            // set on posting
  itemCostPriceId             String?                            // set when posting rolled the cost price
  createdAt                   DateTime      @default(now())

  receipt                     GoodsReceipt     @relation(fields: [receiptId], references: [id], onDelete: Cascade)
  stockItem                   StockItem        @relation(fields: [stockItemId], references: [itemId])
  putAwayPharmacyUnit         PharmacyUnit?    @relation(fields: [putAwayPharmacyUnitId], references: [id])
  batch                       StockBatch?      @relation(fields: [batchId], references: [id])
  itemCostPrice               ItemCostPrice?   @relation(fields: [itemCostPriceId], references: [id])

  @@index([receiptId])
  @@index([stockItemId])
  @@index([batchId])
}

// A supplier's invoice or delivery note attached to a goods receipt: a link to a stored file (§10.3).
model GoodsReceiptAttachment {
  id           String       @id @default(uuid())
  receiptId    String
  storedFileId String
  description  String?                      // "Invoice page 2"
  attachedBy   String
  attachedAt   DateTime     @default(now())

  receipt      GoodsReceipt @relation(fields: [receiptId], references: [id], onDelete: Cascade)
  storedFile   StoredFile   @relation(fields: [storedFileId], references: [id])

  @@unique([receiptId, storedFileId])
}

enum ReceiptType {
  DELIVERY // from a supplier
  OPENING  // opening stock at go-live: no supplier, posted as OPENING
}

enum ReceiptStatus {
  DRAFT
  POSTED
  CANCELLED // drafts only
}
```

```sql
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT goods_receipt_supplier
  CHECK ("type" = 'OPENING' OR "supplierId" IS NOT NULL);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_selling_units_per_purchase_unit_positive
  CHECK ("sellingUnitsPerPurchaseUnit" > 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_purchase_units_valid
  CHECK ("purchaseUnitsDelivered" >= 0 AND "purchaseUnitsAccepted" >= 0
         AND "purchaseUnitsAccepted" <= "purchaseUnitsDelivered");
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_reject_reason
  CHECK ("purchaseUnitsAccepted" = "purchaseUnitsDelivered" OR "rejectReason" IS NOT NULL);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_purchase_unit_cost_non_negative CHECK ("purchaseUnitCost" >= 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_receive_as CHECK ("receiveAs" IN ('AVAILABLE', 'QUARANTINE'));
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_keep_cost_reason
  CHECK ("updateCost" OR "keepCostReason" IS NOT NULL);
```

### 10.2 Flow

1. **Draft.** Staff enter the delivery as it appears on the invoice and in the boxes: the supplier
   (found by name or created, §5), invoice number, and per product the purchase units delivered and
   accepted, the cost of one purchase unit, batch number and expiry. **The product is picked or added
   on the item itself**: `stockItemId` for one already on the system, or `newProduct` (the fields of
   `POST /pharmacy/items`) to create its billable item and stock item in the same write. Going live
   never needs products set up first; the next delivery picks the product that now exists. The product's purchase unit and selling units per
   purchase unit are copied on, never typed. A draft is freely editable and changes no stock.
   `receiveAs` defaults from `StockItem.quarantineOnReceipt`. Invoice photos can be attached now or
   later (§10.3).

   The **batch number** and **expiry** are read off the carton for each product and entered here;
   they're required for `batchTracked` products. Posting turns each into a `StockBatch` (§6): a new
   one for a lot never received before, the existing one for a lot already in stock.
2. **Post** (`pharmacy.receipt.post`), in one database transaction:
   - validates every item (below) and reports **all** failing items in one 400;
   - finds or creates each item's batch (§6.1) and sets `batchId`;
   - writes one `RECEIPT` (or `OPENING`) transaction with a `+purchaseUnitsAccepted ×
     sellingUnitsPerPurchaseUnit` movement per item at its location and `receiveAs` status; the
     trigger updates the balances;
   - rolls `ItemCostPrice` forward where due (§11) and sets `itemCostPriceId`;
   - stamps `postedAt/postedBy` and the `transactionId`;
   - returns `{ id, message, priceWarnings }`, where `priceWarnings` lists the products on the
     receipt whose cost price per selling unit is now above their self-pay selling price, or that
     have no selling price yet (§11).
3. **Posted receipts are immutable.** A wrong quantity is corrected by an adjustment (§14), wrong
   goods by a supplier return. A wrong batch number or expiry, see §6.1. Photos can still be added.

**Validation at posting:**

- item is stocked and `ACTIVE`;
- the item's copied `sellingUnitsPerPurchaseUnit` still equals the product's (a draft saved before
  the product's first movement could disagree if the product was changed since);
- `batchTracked` items have a batch number and expiry;
- **expiry is after `receivedAt`**: expired goods can't be accepted (reject them on the item);
- item location is active and in the receipt's branch;
- supplier active (for `DELIVERY`);
- items for the same lot agree on expiry, and agree with the existing batch row.

**Only accepted stock enters inventory.** `purchaseUnitsDelivered` vs `purchaseUnitsAccepted` with a
`rejectReason` records short-dated, broken or wrong cartons handed back to the driver; the difference
never touches a balance. Shortfalls against an order (slice 3) are the PO's concern: the receipt
records what came.

**Opening stock** is a receipt of type `OPENING`: no supplier, but a cost per purchase unit so the
stock can be valued and priced against cost from day one. Typically one per location at go-live; a
bulk import (CSV) builds on the same endpoint (§23). Opened purchase units at go-live, see §24.

### 10.3 Invoice photos

Files go through the central file store (`StoredFile`): uploaded once, given an id, linked wherever they
belong. For now the bytes sit on the server's disk and are served by `GET /files/:id/content`; how files
are stored is deferred (§24), and only the file store knows.

- **Upload first:** `POST /files` (multipart `files`, one or more: JPEG, PNG or PDF, 10 MB each) returns
  `{ count, docs }` with each file's `id`. The same file uploaded again in the hospital returns its
  existing stored file.
- **Attach when creating:** `POST /pharmacy/goods-receipts` takes `attachmentFileIds`, one or more, and
  links them in the same write. Each must be one of the hospital's stored files.
- **Attach later:** `POST /pharmacy/goods-receipts/:id/attachments` with `attachmentFileIds` (an invoice
  page that arrives after the goods), on a draft or posted receipt, never a cancelled one. A file already
  attached is skipped.
- **Detach** (`DELETE …/attachments/:attachmentId`) only while the receipt is a draft; the stored file
  stays. Once posted, the attachments are the evidence for the stock and the cost price.

### 10.4 Totals

The supplier's invoice carries a total: what the hospital owes for the delivery, and what an auditor
checks. The receipt stores it as printed (`supplierInvoiceTotal`, optional: opening stock has no
invoice) and works the rest out from its items, never storing them, so they can't drift:

| Total | Worked out as |
|---|---|
| `deliveredValue` | Σ purchase units delivered × cost of one: what the invoice lines add up to |
| `acceptedValue` | Σ purchase units accepted × cost of one: what entered stock |
| `rejectedValue` | delivered − accepted: what was handed back to the driver |
| `invoiceDifference` | `supplierInvoiceTotal` − `deliveredValue`: 0 when the lines match the invoice |

They come back as `totals` on the receipt detail and the list, for whoever can see receipt costs
(§17). A difference doesn't stop posting (invoices carry VAT, delivery charges or discounts the lines
don't), but the screen shows it before the pharmacist posts.

## 11. Cost Price and Selling Price

Four separate figures, never merged:

| Figure | Where | Amoxil syrup, carton of 24 |
|---|---|---|
| What this lot cost | `GoodsReceiptItem.purchaseUnitCost` (per batch, §9.3) | ₦50,000.00 a carton |
| Cost price in effect, per selling unit | `ItemCostPrice` (`purchaseUnitCost ÷ sellingUnitsPerPurchaseUnit`, worked out) | ₦2,083.33 a bottle |
| Selling price, per selling unit | `ItemSellingPrice.sellingUnitPrice` (`12` §6) | ₦2,500.00 a bottle |
| What the patient finally pays | charge and allocation (`13`) | 3 × ₦2,500.00 = ₦7,500.00 |

**The selling price is the hospital's.** It's a self-pay `MANUAL` line per selling unit, set when
the product is added (§3.3) or later through Billables. Payer lines (tariffs, discounts) work as in
`12`. `MARKUP` stays available for a hospital that wants the price to follow cost automatically; it
is worked out on the purchase unit cost and rounded once (`12` §5.2).

**The selling price is per item, not per batch.** If it followed the batch's cost, the same bottle
would have two prices on the same day depending on which lot the pharmacist picked. Patients and
HMOs won't accept that, and FEFO would change the bill.

**Below-cost warning.** Selling below cost is sometimes deliberate (a promotion, a government
programme), so it's never blocked, but it's never silent either:

- **When a self-pay price is set** for a stocked item (`POST /billables/items/:id/prices`, or the
  price on `POST /pharmacy/items`) and `sellingUnitPrice` is below the cost price per selling unit in
  effect, the response carries `warning: "Selling price ₦2,000.00 is below the cost price ₦2,083.33
  per bottle"`. The line is still created; the UI offers to raise it.
- **When a receipt is posted** and the rolled cost price per selling unit is now above the item's
  self-pay selling price, the item is listed in the post response's `priceWarnings`
  (`{ itemId, name, sellingUnit, sellingUnitCostPrice, sellingUnitPrice }`), with
  `sellingUnitPrice: null` for an item that has no selling price yet.
- `GET /pharmacy/items?belowCost=true` lists every stocked item whose selling price is below its
  cost price per selling unit, or which has none (with `billable.cost.view`).

**Posting a receipt rolls `ItemCostPrice` forward** *(proposed: on by default)*. For each product on
the receipt with `updateCost` items:

- if the product has no cost price in effect, a new `ItemCostPrice` row starts now;
- if the item's cost per selling unit (`purchaseUnitCost ÷ sellingUnitsPerPurchaseUnit`) **equals**
  the current one, nothing changes (no churn on repeat buys at the same price);
- otherwise the current row is ended now and a new row starts now with the item's
  `purchaseUnitCost` and `sellingUnitsPerPurchaseUnit`, `source` = the GRN number and supplier
  invoice, `reason` = "Goods receipt GRN-000123". `MARKUP` lines reprice from that moment, as `12`
  §5.3 intends; `MANUAL` prices don't move, which is what the warning above is for.
- Several `updateCost` items for the same product on one receipt must carry the same cost; otherwise
  the post is a 400 asking for all but one to be unticked.

**Effective from posting, not `receivedAt`.** `12` forbids backdating cost, and charges may already
have been posted at the old cost in between.

**Unticking `updateCost`** needs `keepCostReason` (a one-off cheap buy, donated stock). The batch
still carries its real cost for valuation (§9.3).

**The receipt's posting permission covers the cost roll.** The person who posts a receipt doesn't
also need `billable.cost.create`; the roll is part of the receipt and is traceable to it through
`GoodsReceiptItem.itemCostPriceId`.

## 12. Rotation, Expiry and the Issue Contract

### 12.1 FEFO: the order batches are offered in

**The pharmacy says which batch it took; the system never guesses.** A batch the system picked could
differ from the one handed over, and then recalls trace the wrong patients and balances drift from the
shelves. So every line leaving a unit names its `batchId`, and the eligibility rules (§8.2) decide
only whether that batch can be taken.

FEFO (first expiry, first out) is how the choice is presented. Wherever staff pick a batch (the
item's stock view, Dispensing's picker, a transfer), usable batches are listed:

1. usable balances only (§8.2) at that unit;
2. soonest `expiryDate` first (no expiry last), then batch `firstReceivedAt`, then batch id.

The first batch listed is what the pharmacy should take out first. Taking a later one is allowed
(an opened carton, a patient's preference); it's the pharmacist's call and the record says what
they did.

### 12.2 Expiry monitoring

- `Organization.nearExpiryDays` (default 90) sets the near-expiry window, a column like the age
  cutoffs (`06` §2.7).
- `GET /pharmacy/expiry` lists batches with stock (at a location, a branch or everywhere), grouped as *expired*,
  *expiring within the window*, with quantities by location and value (with `billable.cost.view`).
- Nothing is flagged by a job: expiry is computed from the date at query time, so expired stock is
  ineligible the moment the day turns. It stays on the balance until written off (§14).

### 12.3 The issue contract (for Dispensing)

Dispensing, ward consumables and theatre usage take stock out through one service method, built and
tested here, wired to endpoints by the Dispensing PRD:

```ts
issue(input: {
  organizationId: string; branchId: string; userId: string;
  pharmacyUnitId: string;                   // the unit it leaves from
  sourceType: string; sourceId: string;     // the dispensing record / ward usage line
  lines: { itemId: string; batchId: string; sellingUnitQuantity: number }[]; // the batch taken out; whole, or .5 if sellableInHalves
}): Promise<{ transactionId: string }>
```

It checks every line's batch is the item's and usable at the unit (§8.2), and its quantity whole or
half as the product allows, reporting every failing line in one 400; then inserts one `ISSUE`
transaction with a movement per line. Taking more than the batch holds there is a 409 *insufficient
stock* (the balance CHECK). The caller keeps the batch on its own record (traceability for recalls). `returnIssue` reverses part of an issue as
`ISSUE_RETURN` to the same batches. Inventory never charges: the caller posts the charge at the point
of use (`13`). Linking the dispensing record and the charge is the Dispensing PRD's job.

## 13. Moving Stock

Slice 2. With flat locations every move is a transfer: Main Store → OPD Dispensary, Branch A →
Branch B. A one-step *relocation* (shelf to shelf inside a store) returns if locations are nested
later (§7.1). Slice 2 adds `IN_TRANSIT` to `StockStatus` and the transfer transaction types.

```prisma
model StockTransfer {
  id                    String         @id @default(uuid())
  organizationId        String
  number                String                         // "TRF-000045"
  fromLocationId        String
  toLocationId          String
  fromBranchId          String
  toBranchId            String
  status                TransferStatus @default(DISPATCHED)
  note                  String?
  dispatchedAt          DateTime       @default(now())
  dispatchedBy          String
  receivedAt            DateTime?
  receivedBy            String?
  cancelledAt           DateTime?
  cancelledBy           String?
  cancelReason          String?
  dispatchTransactionId String         @unique
  receiveTransactionId  String?        @unique
  shortfallAdjustmentId String?        @unique         // raised when less arrived than was sent

  lines                 StockTransferLine[]

  @@unique([organizationId, number])
  @@index([organizationId, toLocationId, status])
  @@index([organizationId, fromLocationId, status])
}

model StockTransferLine {
  id               String        @id @default(uuid())
  transferId       String
  itemId           String
  batchId          String
  sellingUnitsSent     Decimal  @db.Decimal(12, 1)
  sellingUnitsReceived Decimal? @db.Decimal(12, 1)
  discrepancyNote  String?

  transfer         StockTransfer @relation(fields: [transferId], references: [id], onDelete: Cascade)

  @@unique([transferId, batchId])
}

enum TransferStatus {
  DISPATCHED
  RECEIVED
  CANCELLED // before receipt; stock returns to source
}
```

```sql
ALTER TABLE "StockTransferLine" ADD CONSTRAINT transfer_line_quantities
  CHECK ("sellingUnitsSent" > 0 AND ("sellingUnitsReceived" IS NULL OR "sellingUnitsReceived" BETWEEN 0 AND "sellingUnitsSent"));
ALTER TABLE "StockTransferLine" ADD CONSTRAINT transfer_line_discrepancy_note
  CHECK ("sellingUnitsReceived" IS NULL OR "sellingUnitsReceived" = "sellingUnitsSent" OR "discrepancyNote" IS NOT NULL);
```

- **Dispatch** (`pharmacy.transfer.dispatch`): lines by batch and quantity, as taken off the shelf
  (§12.1). Only eligible stock is sent. One `TRANSFER_DISPATCH` transaction: −n `AVAILABLE` at the
  source, +n `IN_TRANSIT` at the destination. The goods are visibly on the way, and the total is
  unchanged.
- **Receive** (`pharmacy.transfer.receive`), by staff at the destination: the quantity received per
  line. One `TRANSFER_RECEIVE` transaction moves the received quantity `IN_TRANSIT` → `AVAILABLE`.
  **A shortfall stays `IN_TRANSIT`** and a pending `LOSS` adjustment (§14) is raised for it
  automatically, so missing stock is never silently dropped: someone must approve it as lost.
  More than was sent can't be received.
- **Cancel** before receipt (dispatcher, with a reason): `IN_TRANSIT` goes back to `AVAILABLE` at
  the source.
- A ward asking the store for stock (requisition) is a later addition on top of transfers (§23).

## 14. Adjustments, Write-offs and Quality

### 14.1 `StockAdjustment`

```prisma
model StockAdjustment {
  id             String           @id @default(uuid())
  organizationId String
  branchId       String
  number         String                         // "ADJ-000017"
  reason         AdjustmentReason
  narrative      String
  evidenceRef    String?                        // uploaded file / incident report reference
  status         AdjustmentStatus @default(PENDING)
  requestedBy    String
  requestedAt    DateTime         @default(now())
  decidedBy      String?
  decidedAt      DateTime?
  decisionNote   String?
  transactionId  String?          @unique       // set when approved and posted

  lines          StockAdjustmentLine[]

  @@unique([organizationId, number])
  @@index([organizationId, status])
}

model StockAdjustmentLine {
  id           String          @id @default(uuid())
  adjustmentId String
  pharmacyUnitId   String
  batchId      String
  itemId       String
  status       StockStatus
  sellingUnitQuantity Decimal @db.Decimal(12, 1) // signed; −10 = write 10 off

  adjustment   StockAdjustment @relation(fields: [adjustmentId], references: [id], onDelete: Cascade)

  @@unique([adjustmentId, pharmacyUnitId, batchId, status])
}

enum AdjustmentReason {
  EXPIRED
  DAMAGED
  RECALLED
  LOSS           // missing, incl. transfer shortfalls
  THEFT
  FOUND          // stock found that wasn't on the system (+)
  DATA_CORRECTION
  OTHER
}

enum AdjustmentStatus {
  PENDING
  APPROVED   // posted
  REJECTED
  CANCELLED  // by the requester while pending
}
```

```sql
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT adjustment_line_non_zero CHECK ("sellingUnitQuantity" <> 0);
ALTER TABLE "StockAdjustment" ADD CONSTRAINT adjustment_maker_checker
  CHECK ("decidedBy" IS NULL OR "decidedBy" <> "requestedBy");
```

### 14.2 Rules

- **Maker-checker** *(proposed)*: any adjustment, whichever direction, is requested
  (`pharmacy.adjustment.request`) and approved by someone else (`pharmacy.adjustment.approve`).
  The CHECK enforces "someone else" at the database. Same principle as `FinancialRequest` (`10` §8),
  but its own table: it moves stock, not money on accounts. Value-based approval limits, like
  `ApprovalLimit`, can follow if hospitals ask (§24).
- **Approval posts** one `ADJUSTMENT` transaction from the lines. If stock has moved since the
  request and a negative line would overdraw, the CHECK rejects it, the request stays `PENDING`, and
  the approver sees a 409 naming the line.
- **`EXPIRED` lines** must be on expired batches, **`RECALLED`** on recalled ones; **`FOUND`** lines
  are positive and need an existing batch (a lot nobody received is a receipt, not an adjustment).
- **The value written off** is shown to approvers (with `billable.cost.view`) from §9.3.

### 14.3 Batch quality

`POST /pharmacy/batches/:id/quality` (`pharmacy.batch.quality`): `RELEASED` ↔ `ON_HOLD`, or
→ `RECALLED` with `recallReference`; reason required, actor and time recorded on the batch. The recall
view lists every balance of the batch by location (and, once Dispensing exists, every issue of it).

## 15. Stocktake

```prisma
model StockCount {
  id             String           @id @default(uuid())
  organizationId String
  branchId       String
  number         String                         // "CNT-000003"
  pharmacyUnitId     String                         // the location counted
  categoryId     String?                        // optional: only this category's items
  blind          Boolean          @default(true) // counters don't see system quantities
  status         StockCountStatus @default(OPEN)
  startedBy      String
  startedAt      DateTime         @default(now())
  submittedBy    String?
  submittedAt    DateTime?
  approvedBy     String?
  approvedAt     DateTime?
  transactionId  String?          @unique

  lines          StockCountLine[]

  @@unique([organizationId, number])
  @@index([organizationId, status])
}

model StockCountLine {
  id              String     @id @default(uuid())
  countId         String
  pharmacyUnitId      String
  batchId         String
  itemId          String
  status          StockStatus                  // AVAILABLE | QUARANTINE | DAMAGED
  systemSellingUnits  Decimal @db.Decimal(12, 1) // balance when this line was counted
  countedSellingUnits Decimal @db.Decimal(12, 1)
  countedBy       String
  countedAt       DateTime   @default(now())
  note            String?

  count           StockCount @relation(fields: [countId], references: [id], onDelete: Cascade)

  @@unique([countId, pharmacyUnitId, batchId, status])
}

enum StockCountStatus {
  OPEN
  SUBMITTED
  APPROVED
  CANCELLED
}
```

```sql
ALTER TABLE "StockCountLine" ADD CONSTRAINT count_line_non_negative CHECK ("countedSellingUnits" >= 0);
ALTER TABLE "StockCount" ADD CONSTRAINT count_maker_checker
  CHECK ("approvedBy" IS NULL OR "approvedBy" <> "submittedBy");
```

- **No freeze.** The pharmacy keeps working during a count. Each line snapshots the system quantity
  *at the moment it's counted*, so the variance is `countedSellingUnits − systemSellingUnits`, unaffected by
  dispensing before or after.
- **Approval posts** one `COUNT_VARIANCE` transaction with a movement per non-zero variance. Only
  counted lines are touched; anything not counted is left alone, and the count report lists balances
  in scope that weren't counted.
- Blind counts hide `systemSellingUnits` from counters; supervisors see it on review.

## 16. Reorder Levels

```prisma
model StockLevel {
  id              String          @id @default(uuid())
  organizationId  String
  itemId          String
  pharmacyUnitId      String                       // a store, dispensary or ward
  minSellingUnits      Int                     // below this = low stock
  reorderPurchaseUnits Int?                    // suggested order, in the product's purchase units
  maxSellingUnits      Int?
  updatedAt       DateTime        @updatedAt
  updatedBy       String?

  stockItem       StockItem       @relation(fields: [itemId, organizationId], references: [itemId, organizationId])
  pharmacyUnit    PharmacyUnit @relation(fields: [pharmacyUnitId, organizationId], references: [id, organizationId])

  @@unique([itemId, pharmacyUnitId])
}
```

`GET /pharmacy/low-stock` compares eligible stock at each level's location with
`minSellingUnits`, and shows stock in transit to it. Purchase-order suggestions build on it (slice 3).

## 17. Permissions

`pharmacy.*` in `src/access-control/permissions.catalog.ts`, one key per job.

| Key | Name | Grants |
|---|---|---|
| `pharmacy.stock.view` | Pharmacy: View Stock | Stocked items, locations, suppliers, manufacturers, drugs, batches, balances, movements, receipts, transfers, adjustments, counts, expiry and low-stock views |
| `pharmacy.medicine.manage` | Manage Hospital Medicines | Add or edit the hospital's own medicines (never seeded ones) |
| `pharmacy.item.manage` | Manage Stock Items | Add products (item + stock settings, optional first selling price), medicine link, brand and maker, selling and purchase units, reorder levels |
| `pharmacy.unit.manage` | Manage Pharmacy Units | Create, edit, deactivate stores and dispensaries |
| `pharmacy.supplier.manage` | Manage Suppliers & Manufacturers | Suppliers and manufacturers |
| `pharmacy.receipt.create` | Record Goods Receipt | Create, edit and cancel draft receipts (incl. opening stock); add a new product from a receipt item; attach invoice photos |
| `pharmacy.receipt.post` | Post Goods Receipt | Post a receipt into stock (rolls cost, §11) |
| `pharmacy.stock.release` | Release Quarantine | `QUARANTINE` → `AVAILABLE` |
| `pharmacy.stock.status` | Change Stock Status | Quarantine, mark damaged |
| `pharmacy.batch.quality` | Hold / Recall Batch | Batch quality status |
| `pharmacy.transfer.dispatch` | Dispatch Transfer | Send stock to another location; cancel own dispatch |
| `pharmacy.transfer.receive` | Receive Transfer | Receive at the destination |
| `pharmacy.adjustment.request` | Request Stock Adjustment | Raise and cancel adjustments / write-offs |
| `pharmacy.adjustment.approve` | Approve Stock Adjustment | Approve or reject someone else's |
| `pharmacy.count.manage` | Run Stock Count | Start, count, submit, cancel |
| `pharmacy.count.approve` | Approve Stock Count | Approve variances |

**Cost visibility** reuses `billable.cost.view` (`12` §10): without it, responses leave out purchase
unit costs, cost prices per selling unit, batch costs and values. The exception is a receipt's own lines, which holders of
`pharmacy.receipt.*` see because they enter them.

**Seeded duty profiles** (slice 1, Pharmacy department, no queues; tenant-editable, and the seeder
adds back a missing system permission, so tenants extend them rather than trim them):

| Profile | Role | Gains |
|---|---|---|
| Pharmacy Technician | `PHARMACY_TECHNICIAN` | `pharmacy.stock.view`, `receipt.create`, `stock.status`, `billable.view` |
| Pharmacist | `PHARMACIST` | the technician's, plus `receipt.post`, `stock.release`, `batch.quality`, `medicine.manage`, `item.manage` |
| Pharmacy Manager | `MANAGER` | every `pharmacy.*` key, `billable.view`, `billable.cost.view` |
| Hospital Administrator | `SUPERADMIN` | gains `pharmacy.stock.view` |

A technician records a receipt and a pharmacist posts it, so posting (which moves cost prices) and
releasing quarantine are always a second person's check. Slice 2 adds its keys to these profiles, and
may add a ward profile (`pharmacy.stock.view`, `transfer.receive`, `adjustment.request`) and an internal
auditor (`pharmacy.stock.view`, `count.approve`, `billable.cost.view`).

## 18. APIs

All under `/api/pharmacy`. Every query is scoped to the caller's `organizationId`; writes record the
actor from the token; lists return `{ count, docs }` with `limit` (20) / `offset`.

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/medicines` | GET | `pharmacy.stock.view` | `{ count, docs }`: seeded medicines plus the caller's own, each with `source` (`SYSTEM` / `USER_ADDED`) and its uses; filter `search` (name, alias, ingredient; partial), `therapeuticUse` (code), `dosageForm`, `route`, `bodySystem`, `legalCategory`, `status`, `source` |
| `/therapeutic-uses` | GET | `pharmacy.stock.view` | `{ count, docs }`: every use with its medicine count, for the filter and the add-medicine form |
| `/medicines` | POST | `pharmacy.medicine.manage` | Add a hospital medicine: `genericName`, `strength?`, `dosageForm`, `route`, `presentation?`, `ingredients?`, `aliases?`, `therapeuticUses?` (codes), `bodySystems?`, `legalCategory?`, `controlled?`, `description?`; 409 if it matches a seeded or own medicine |
| `/medicines/stats` | GET | `pharmacy.stock.view` | Catalogue figures for the medicines page: `total` (active), `inactive`, `userAdded`, `stocked` (named by one of the hospital's products), `controlled`, and how many different `dosageForms`, `routes`, `legalCategories` and `therapeuticUses` the active medicines cover |
| `/medicines/:id/merge` | POST | `pharmacy.medicine.manage` | Merge the hospital's own medicine into its `seededMatch`: products move to the seeded medicine, the copy becomes `INACTIVE`. 400 if nothing seeded matches; 403 for a seeded medicine. Returns `{ id, message }` (the seeded medicine's id) |
| `/medicines/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.medicine.manage` | Detail with its uses and the hospital's products / edit own medicine (seeded rows: 403) |
| `/items` | POST | `pharmacy.item.manage` (+ `billable.price.create` when a price is given) | Add a product (§3.3): `categoryId` or `category: { name }`, `code`, `name`, `sellingUnit`, `description?`, `medicineId` (required for `PHARMACY`), `brandName?`, `manufacturerId` or `manufacturer: { name, country? }` (optional), `registrationNo?`, `shelfNumber?`, `purchaseUnitName`, `sellingUnitsPerPurchaseUnit`, `sellableInHalves?`, `batchTracked?`, `quarantineOnReceipt?`, `storageCondition?`, `sellingUnitPrice?` + `reason` (first self-pay `MANUAL` line). Returns `{ id, message, warning? }` |
| `/items` | GET | `pharmacy.stock.view` | Stocked items with category, medicine, strength, brand, selling unit, purchase unit, stock totals in selling units (§8.2) for `pharmacyUnitId?` / `branchId?`, and (cost view) cost price and selling price per selling unit; filter `kind`, `categoryId`, `medicineId`, `search` (code, name, brand, generic name), `lowStock`, `belowCost` (cost view), `status` |
| `/items/:itemId` | PUT | `pharmacy.item.manage` | Make an existing catalogue item stocked / update settings: the stock fields of `POST /items`. `purchaseUnitName`, `sellingUnitsPerPurchaseUnit` and `sellableInHalves` are refused (400) once the product has a movement |
| `/items/:itemId` | GET | `pharmacy.stock.view` | Settings, medicine, selling and purchase units, levels, totals, (cost view) cost price and selling price per selling unit |
| `/items/:itemId/stock` | GET | `pharmacy.stock.view` | Balances by batch × location × status, with eligibility, expiry and (cost view) value |
| `/items/:itemId/levels` | PUT / GET | `pharmacy.item.manage` / `pharmacy.stock.view` | Set / list reorder levels per location |
| `/units` | POST / GET | `pharmacy.unit.manage` / `pharmacy.stock.view` | Create / list for `branchId?` |
| `/units/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.unit.manage` | Detail with stock summary / edit, deactivate |
| `/suppliers`, `/manufacturers` | POST / GET | `pharmacy.supplier.manage` / `pharmacy.stock.view` | Create ahead of time (usually created from receipts and products, §5) / list for the pickers (`search`, `status`) |
| `/suppliers/:id`, `/manufacturers/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.supplier.manage` | Detail / edit, deactivate |
| `/goods-receipts` | POST / GET | `pharmacy.receipt.create` / `pharmacy.stock.view` | Draft the header: `type`, `supplierId` or `supplier: { name, phone?, email? }` (`DELIVERY`), `pharmacyUnitId?` (default: the caller's branch store, §7.1), `supplierInvoiceNo?`, `supplierInvoiceDate?`, `supplierInvoiceTotal?`, `deliveryNote?`, `receivedAt`, `notes?`, `attachmentFileIds?` (ids from `POST /files`, one or more); returns `{ id, number, message }` / list (filter `status`, `supplierId`, `type`, `from`, `to`) |
| `/goods-receipts/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.receipt.create` | Detail with items, batches (once posted) and photos; purchase unit costs only with `billable.cost.view` or `pharmacy.receipt.*` / edit a draft's header |
| `/goods-receipts/:id/items` | POST | `pharmacy.receipt.create` (+ `billable.price.create` for a price in `newProduct`) | Add one product to a draft: `stockItemId`, or `newProduct` to create it (§10.2), `purchaseUnitsDelivered`, `purchaseUnitsAccepted`, `rejectReason?`, `purchaseUnitCost`, `batchNumber?`, `expiryDate?`, `manufacturedOn?`, `putAwayPharmacyUnitId?`, `receiveAs?`, `updateCost?`, `keepCostReason?`. The purchase unit and its selling units are copied from the product. Returns `{ id, stockItemId, message }` |
| `/goods-receipts/:id/items/:itemId` | PATCH / DELETE | `pharmacy.receipt.create` | Change / remove one item of a draft |
| `/goods-receipts/:id/post` | POST | `pharmacy.receipt.post` | Post (§10.2); 400 lists every failing item. Returns `{ id, message, priceWarnings }` (§11) |
| `/goods-receipts/:id/attachments` | POST | `pharmacy.receipt.create` | Attach stored files: `attachmentFileIds` (ids from `POST /files`, one or more), `description?`; draft or posted (§10.3) |
| `/goods-receipts/:id/attachments/:attachmentId` | DELETE | `pharmacy.receipt.create` | Detach a file, draft only (the stored file stays) |
| `/goods-receipts/:id/cancel` | POST | `pharmacy.receipt.create` | Cancel a draft (`reason`) |
| `/batches` | GET | `pharmacy.stock.view` | Search by `itemId`, `batchNumber`, `qualityStatus`, expiry range |
| `/batches/:id` | GET | `pharmacy.stock.view` | Batch with balances, receipt items, movements, cost (cost view) |
| `/batches/:id/quality` | POST | `pharmacy.batch.quality` | `status`, `reason`, `recallReference?` |
| `/status-changes` | POST | `pharmacy.stock.status` / `pharmacy.stock.release` per §8.3 | `{ pharmacyUnitId, lines: [{ batchId, from, to, sellingUnitQuantity }], reason }` |
| `/transfers` | POST / GET | `pharmacy.transfer.dispatch` / `pharmacy.stock.view` | Dispatch / list (filter `status`, `fromLocationId`, `toLocationId`) |
| `/transfers/:id` | GET | `pharmacy.stock.view` | Detail |
| `/transfers/:id/receive` | POST | `pharmacy.transfer.receive` | `{ lines: [{ lineId, sellingUnitsReceived, discrepancyNote? }] }` |
| `/transfers/:id/cancel` | POST | `pharmacy.transfer.dispatch` | Before receipt (`reason`) |
| `/adjustments` | POST / GET | `pharmacy.adjustment.request` / `pharmacy.stock.view` | Request / list (filter `status`, `reason`) |
| `/adjustments/:id` | GET | `pharmacy.stock.view` | Detail with value (cost view) |
| `/adjustments/:id/approve`, `/reject`, `/cancel` | POST | `…approve` / `…approve` / `…request` | Decide (`note`) / withdraw own |
| `/counts` | POST / GET | `pharmacy.count.manage` / `pharmacy.stock.view` | Start (`pharmacyUnitId`, `categoryId?`, `blind`) / list |
| `/counts/:id/lines` | PUT | `pharmacy.count.manage` | Record counted lines (upsert by location + batch + status) |
| `/counts/:id/submit`, `/approve`, `/cancel` | POST | `…manage` / `…approve` / `…manage` | Lifecycle |
| `/movements` | GET | `pharmacy.stock.view` | Ledger: filter `itemId`, `batchId`, `pharmacyUnitId`, `type`, dates |
| `/expiry` | GET | `pharmacy.stock.view` | §12.2: `pharmacyUnitId?`, `withinDays?` (default org setting) |
| `/low-stock` | GET | `pharmacy.stock.view` | §16 |
| `/valuation` | GET | `pharmacy.stock.view` + `billable.cost.view` | Stock value by item / category / location at now (§9.3) |
| `/ledger/check` | GET | `pharmacy.stock.view` | Balances that don't equal their movements (should be none) |
| `/metrics` | GET | `pharmacy.stock.view` | Overview: stocked items, low stock, expiring, expired, quarantine, pending adjustments, transfers in transit |

## 19. Code Layout and Changes to Existing Models

**Module**: `src/inventory/` (`items`, `pharmacy-units`, `suppliers`, `goods-receipts`, `batches`, `movements`,
`transfers`, `adjustments`, `counts`, `inventory.rules.ts` + `inventory.rules.spec.ts` for FEFO,
eligibility, cost roll, purchase-unit-to-selling-unit conversion, whole-or-half quantities, the
below-cost check and transfer/adjustment state rules). It imports
`BillablesModule` to create and read items, add the first selling price and roll `ItemCostPrice`. Dispensing (the existing `src/pharmacy/` stub)
will import Inventory; nothing imports in the other direction. DTOs in
`src/shared/contracts/inventory`, enum mirrors in `src/shared/enums/inventory`.

| Current | Becomes |
|---|---|
| — | `Medicine`, `TherapeuticUse`, `MedicineTherapeuticUse` (seeded), `StockItem`, `Supplier`, `Manufacturer`, `StockBatch`, `PharmacyUnit`, `StockBalance`, `StockTransaction`, `StockMovement`, `GoodsReceipt`, `GoodsReceiptItem`, `GoodsReceiptAttachment` (slice 1); `StockTransfer(Line)`, `StockAdjustment(Line)`, `StockCount(Line)`, `StockLevel` (slice 2); enums as above |
| `BillableItem` | `unit` renamed **`sellingUnit`**. Gains `stockItem` relation. **`sellingUnit` can't change once the item has a movement** (rule added to `PATCH /billables/items/:id`). Created without a self-pay line only through `POST /pharmacy/items` (§3.3) |
| `ItemCost` → **`ItemCostPrice`** | Renamed, with `packCost` → **`purchaseUnitCost`** and `unitsPerPack` → **`sellingUnitsPerPurchaseUnit`** (`12` §5). Gains `receiptItems` relation (`GoodsReceiptItem.itemCostPriceId`) |
| `ItemPrice` → **`ItemSellingPrice`** | Renamed, with `amount` → **`sellingUnitPrice`** (`12` §6). `POST /billables/items/:id/prices` returns `warning` for a stocked item's self-pay price below its cost price per selling unit (§11) |
| `BillableCategory` | `@@unique([organizationId, name])` replaced by a unique index on `(organizationId, lower(btrim(name)))`, so a typed category matches regardless of case (§5) |
| `Supplier`, `Manufacturer` | `@@unique([organizationId, name])` replaced by the same kind of index (§5) |
| `Charge` | `itemCostId` → **`itemCostPriceId`**, `itemPriceId` → **`itemSellingPriceId`** (`13`) |
| `Organization` | Gains `nearExpiryDays Int @default(90)` and relations `medicines`, `suppliers`, `manufacturers`, `pharmacyUnits`, `goodsReceipts` |
| `Branch` | Gains `pharmacyUnits`, `goodsReceipts`, `stockTransactions` relations. Onboarding and `POST /organizations/:id/branches` create the branch's Main Pharmacy Store with it (§7.1) |
| `prisma/seed.ts` | Seeds medicines and their therapeutic uses from `prisma/data/medicines/medicines-*.json`, insert-only (`organizationId` null, `createdBy` null), and a Main Pharmacy Store for any branch without a store (§7.1) |
| `SequenceCounter` | New scopes `grn:<orgId>`, `trf:<orgId>`, `adj:<orgId>`, `cnt:<orgId>` |
| `permissions.catalog.ts` | §17 keys; seeded profiles as in §17 |
| Migration | Prisma tables + appended SQL from §3.1, §3.2, §6, §8.1, §9.2, §10.1, and, in slice 2, §13, §14.1, §15 |

## 20. Slices

1. **Stock in.** Seeded drugs (plus hospital-added ones), products with their selling and purchase units, suppliers, manufacturers, locations, receipts
   (delivery and opening) with batches and the cost roll, the ledger with its triggers, status
   changes (quarantine release), batch quality, and the stock / batch / movement / expiry / valuation
   views. The FEFO order and the `issue` method with their specs (no endpoint yet).
2. **Stock control.** Transfers, adjustments and write-offs, stocktake, reorder levels
   and low stock.
3. **Procurement.** Purchase orders (draft → approved → sent → partly/fully received → closed),
   receipts against PO lines, reorder suggestions, supplier returns, recall report across issues.
4. **Dispensing PRD** consumes §12.3.

## 21. Worked Example

Two products under the medicine Amoxicillin 125 mg/5 ml oral suspension, category "Antibiotics",
kind `PHARMACY`. Locations at the main branch: Main Store `MS`, OPD Dispensary `OPD`.

| Product | Selling unit | Purchase unit | Selling units per purchase unit | Halves |
|---|---|---|---|---|
| `DRG-AMX125-24` Amoxil 125mg/5ml Suspension, carton of 24 | bottle | Carton | 24 | no |
| `DRG-AMX125-12` Amoxicillin 125mg/5ml Suspension, carton of 12 | bottle | Carton | 12 | no |

| Event | Ledger | Stock afterwards | Cost price / selling price |
|---|---|---|---|
| Both products added, no selling price | — | — | Listed as *no selling price* |
| GRN-000101 from Alpha Pharma, invoice photographed: `-24` 50 cartons delivered and accepted, lot `A123` exp 2027-06-30, ₦50,000.00/carton; `-12` 1 carton, lot `C789` exp 2027-04-30, ₦26,400.00/carton → `MS` | `RECEIPT` +1,200 `A123`, +12 `C789` at `MS` AVAILABLE | `MS`: 1,200 + 12 = **1,212 bottles** of the medicine | `ItemCostPrice` starts: `-24` ₦2,083.33/bottle, `-12` ₦2,200.00/bottle. `priceWarnings`: both have no selling price |
| Manager sets `-24` self-pay ₦2,000.00 | — | — | `warning`: below cost price ₦2,083.33. Raised to ₦2,500.00; `-12` set at ₦2,500.00 too |
| GRN-000108: `-24` 10 cartons, lot `B456` exp 2027-03-31, ₦62,400.00/carton | `RECEIPT` +240 `B456` `MS` | `MS`: `-24` 1,440 · `-12` 12 | Cost price rolled at posting to ₦2,600.00/bottle. `priceWarnings`: `-24` now sells below cost (₦2,500.00). Manager raises it to ₦3,000.00. `A123` still valued at ₦2,083.33/bottle |
| Transfer TRF-000045 `MS` → `OPD`, 300 bottles of `-24`: the store takes out `B456` (offered first, earlier expiry) 240 + `A123` 60 | `TRANSFER_DISPATCH`: `B456` 240 + `A123` 60 | `MS`: `-24` 1,140 · `OPD` in transit 300 | Total unchanged |
| OPD receives all 300 | `TRANSFER_RECEIVE` IN_TRANSIT → AVAILABLE | `OPD`: `-24` 300 | — |
| NAFDAC recalls lot `A123` | No movement; batch `RECALLED` | `A123` at `MS` (1,140) and `OPD` (60) ineligible at once | — |
| Dispensing (later) issues 3 bottles of `-24` at `OPD`, naming `B456` (`A123` is recalled, so it isn't offered) | `ISSUE` 3 from `B456` | `OPD`: `-24` 297 | Charged 3 × ₦3,000.00 = ₦9,000.00 by the dispensing flow |

**Halves.** Emzor Paracetamol 500mg `DRG-PCM500`: selling unit card, purchase unit Carton of 10
cards, `sellableInHalves`. 5 cartons received = 50 cards. Issuing 1.5 cards leaves 48.5; issuing 0.8
of a card is a 400. Amoxil above isn't sellable in halves, so half a bottle is a 400 too.

## 22. Why / Where / Why Not

- **Why extend `BillableItem` rather than a separate drug catalogue.** Everything stocked is also
  sold or charged; one item keeps price, cost, charge and stock on the same id, and consumables get
  the same stock control as drugs with no second system.
- **Why balances per batch per location per status.** Expiry, recall and FEFO need batch; ward and
  dispensary stock need location; quarantine and in-transit need status. Anything coarser can't answer
  "where are the usable units of lot A123".
- **Why a trigger writes balances.** A balance that any service can update will eventually disagree
  with the ledger. With the trigger, the movement *is* the update, overdraws are rejected by a CHECK
  under concurrency, and services do one insert instead of read-modify-write.
- **Why two-step transfers.** Stock leaving the store isn't in the dispensary until someone there
  says so. `IN_TRANSIT` shows it, and shortfalls become an approvable loss instead of a silent gap.
- **Why expiry isn't a status.** A status would need a nightly job and could be stale; the date is
  always right.
- **Why selling units, whole or half.** Stock is counted in what the patient is charged for, so a
  charge's quantity and the stock it took are the same number. Pharmacies do split cards in two, and
  never into any other fraction, so 0.5 is allowed where the product says so and nothing else is.
- **Why one purchase unit per product.** Two carton sizes of the same syrup cost differently per
  bottle; on one product every receipt would overwrite the other's cost price. As two products, each
  keeps its own cost price, and the medicine still adds their stock together.
- **Why receipts roll cost but price stays per item.** See §11: one price per item per day, cost that
  follows the market automatically, and real per-lot cost kept for valuation.
- **Why no freeze during counts.** Hospitals can't close the pharmacy to count it; per-line snapshots
  give the right variance anyway.

## 23. Explicitly Out of Scope for v1

- **Dispensing, prescriptions, medication administration** (Dispensing / prescribing PRDs; §12.3
  is the contract they use).
- **Supplier payables** (invoices owed, payments to suppliers).
- **Requisitions** (a ward requesting stock from the store) — built on transfers.
- **Bulk import** of items and opening stock (CSV) — built on the receipt endpoint.
- **Barcode / GS1 scanning and serialisation**; barcodes are added to the product with that work.
- **Consignment and donated-stock accounting** beyond `keepCostReason`.
- **Temperature logging** for cold chain.
- **Controlled-drug register** (running balance per drug signed by two people) — needs its own rules.
- **Branch-specific prices** (`12` §16).

## 24. Open Decisions

1. **D9 cost roll default** *(proposed)*: receipts update `ItemCostPrice` unless unticked. Alternative:
   cost changes only by hand in Billables.
2. **D12 approval** *(proposed)*: every adjustment needs a second person. Alternatives: only above a
   value threshold (per-profile limits like `ApprovalLimit`), or write-offs only.
3. ~~**Storage condition**~~: closed 2026-11-02. A unit has no storage condition; the product does.
4. **Minimum remaining shelf life on receipt** (e.g. reject < 6 months unless overridden): an
   `Organization` setting or not at all.
5. **Location ↔ department/clinic link**: which dispensary serves which queue. Likely needed by
   Dispensing; could be `PharmacyUnit.departmentId?` added then.
6. **Correcting a batch's number or expiry** after it has moved: never (proposed: adjust out and
   re-receive) or via an approved request.
7. **Opened purchase units at go-live.** An opening count often finds 7 loose bottles from an opened
   carton of 24. Proposed: an `OPENING` receipt item may give `looseSellingUnitsAccepted` on top of
   whole purchase units, valued at the same cost per selling unit; deliveries never can.
8. **Purchase orders before slice 3**: if the hospital's procurement process requires a PO before
   any receipt, slice 3 moves ahead of slice 2.
9. **File storage** *(deferred 2026-11-02)*: the central file store (`StoredFile`, `POST /files`) keeps
   its bytes on the server's disk for now (`FILE_STORAGE_ROOT`, default a `files` folder beside the
   project), served by `GET /files/:id/content`. No Cloudinary. How files are stored (backups, an
   S3-compatible server, sync) is to be redefined; only `FilesService` changes, the ids and links stay.
