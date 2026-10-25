# Feature PRD — Inventory: Drugs & Consumables

Status: Draft · Last updated: 2026-10-23
Depends on: `02-hospital-onboarding.md` (`Organization`, `Branch`), `05-access-control-clinical-scoping.md`
(`Permission`, `DutyProfile`), `12-billables-and-price-catalog.md` (`BillableItem`, `ItemCost`,
`ServiceCategory`).
Answers: `12` §4.3 (drug details, stock and batches; how batch cost feeds `ItemCost`) and `04` §3
("pharmacy stock management is a data-management concern owned by the Pharmacy & Inventory PRD").

This document defines how the hospital puts stock into the system and keeps track of it: what it
stocks, how it's packed, which batch and expiry each quantity belongs to, where it's kept, what it
cost, and every event that changes how much there is. **Every stocked billable uses the same
system**: drugs, consumables (gloves, syringes, dressings) and anything else the hospital buys and
holds (eye glasses, implants).

It does **not** cover dispensing, prescriptions or medication administration. Those are the
Dispensing PRD, which takes stock out through the issue contract in §12 and posts charges the way
`13` describes. Inventory never posts a charge.

**Terminology.**
- *Medicine*: the medicine itself, the same in every hospital: "Paracetamol, tablet, oral".
  System reference data, seeded by CareFusion (§3.1).
- *Item* (or *product*): a `BillableItem` (`12` §4), the hospital's own product: "Emzor
  Paracetamol 500mg". Stock is always held against an item; a drug item names its medicine.
- *Base unit*: the item's `unit` ("capsule", "vial", "pair"), the smallest quantity it's ever
  supplied in. All stock quantities are whole numbers of it.
- *Pack*: a way the item is bought or handled ("Box of 100") with a fixed number of base units.
- *Batch*: a manufacturer's production lot of an item (batch number, expiry).
- *Location*: a place stock is kept (a store, a dispensary, a ward).
- *Balance*: how much of one batch sits at one location in one status.
- *Movement*: a signed change to one balance. A *stock transaction* groups the movements of one
  event (a receipt, a transfer, a write-off).

## 1. Decisions Record

Agreed during design review, 2026-10-23. Rows marked *(proposed)* are recommendations awaiting
confirmation (§24).

| # | Decision | § |
|---|---|---|
| D1 | **One inventory system for every stocked billable.** Stock tracking is a 1:1 extension of `BillableItem` (`StockItem`), opt-in per item, for any category kind. | 3 |
| D1a | **Medicines are system reference data.** `Medicine` (generic name, one dosage form, one route; aliases, ingredients, therapeutic uses, body systems) is seeded by CareFusion; a hospital may add one that's missing, marked `USER_ADDED` and visible only to itself. Strength, brand, maker and NAFDAC number belong to the hospital's product, its `StockItem`, which names its medicine; `PHARMACY`-kind items must. Therapeutic uses are a short list built from the medicines data, for finding medicines, not an ATC tree. *(2026-10-24)* | 3 |
| D2 | **Quantities are whole base units.** Packs are explicit per-item conversions (`ItemPack`). Nothing assumes an item can be split: if it's supplied loose, its base unit is the loose unit. | 4 |
| D3 | **Supplier and manufacturer are separate.** A supplier sells to the hospital; the manufacturer belongs to the product (Emzor Paracetamol and M&B Paracetamol are two products, two prices). | 3, 5 |
| D4 | **A batch is identified by product + batch number**, and can arrive in several deliveries. Expiry belongs to the batch; a later delivery that disagrees is rejected. | 6 |
| D5 | **Locations are flat per branch in v1**: Main Store, OPD Dispensary, Ward 3. Fridges and shelves inside them (a tree) can be added later without breaking anything. | 7 |
| D6 | **Balances are keyed by location + batch + status.** Status is `AVAILABLE`, `QUARANTINE` or `DAMAGED` (`IN_TRANSIT` arrives with transfers). Batch-wide quality (`RELEASED`, `ON_HOLD`, `RECALLED`) sits on the batch; expiry is computed from the date, never flagged by a job. | 8 |
| D7 | **Movements are the only writer of balances.** Movements are append-only; a database trigger applies each one to its balance, and `CHECK (quantity >= 0)` rejects any overdraw. | 9 |
| D8 | **Receiving records what actually arrived**: delivered vs accepted packs per line, each line naming its batch. Only accepted quantities enter stock, optionally into quarantine. | 10 |
| D9 | **Selling price stays per item, not per batch.** *(proposed)* Posting a receipt rolls the item's `ItemCost` forward when the unit cost changed (on by default, off per line), so `MARKUP` prices follow the supplier. Batch cost is kept for valuation. | 11 |
| D10 | **FEFO**: stock leaves earliest-expiry first among eligible stock, and every multi-batch issue records the quantity per batch. | 12 |
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
- **Prescribing and dispensing will work against the medicine.** A doctor prescribes paracetamol
  500 mg tablet, oral; dispensing offers every product in stock that names it, whatever the brand.
- **`controlled` can be unknown.** The NHIA list doesn't say, and guessing `false` would be wrong
  for ketamine, so it stays null until set.

### 3.2 `StockItem` (the hospital's product)

Marks a `BillableItem` as held in stock: "Emzor Paracetamol 500mg". The brand and maker belong here,
because Emzor Paracetamol and M&B Paracetamol are two products with two prices and two sets of batches.

```prisma
model StockItem {
  itemId              String           @id
  organizationId      String
  medicineId          String?          // required for PHARMACY-kind items; its strength is the product's
  brandName           String?          // "Emzor Paracetamol"
  manufacturerId      String?          // the maker identifies the product, not the batch (§5)
  registrationNo      String?          // NAFDAC registration number
  batchTracked        Boolean          @default(true)  // batch number + expiry required on receipt
  quarantineOnReceipt Boolean          @default(false) // receipt lines default to QUARANTINE
  storageCondition    StorageCondition @default(ROOM_TEMPERATURE)
  createdAt           DateTime         @default(now())
  createdBy           String
  updatedAt           DateTime         @updatedAt
  updatedBy           String?

  item                BillableItem     @relation(fields: [itemId, organizationId], references: [id, organizationId])
  medicine            Medicine?        @relation(fields: [medicineId], references: [id])
  manufacturer        Manufacturer?    @relation(fields: [manufacturerId], references: [id])
  packs               ItemPack[]
  batches             StockBatch[]
  receiptItems        GoodsReceiptItem[]

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

### 3.3 Rules

- **Opt-in, any kind.** Any item can be stocked; in practice `PHARMACY` and `CONSUMABLE`. A
  `PHARMACY`-kind stocked item **must** name a medicine; other kinds can't. Moving an item between
  categories is same-kind only (`12` §4.2), so this can't drift.
- **The medicine must be a seeded one or the caller's own.** The service checks this; a foreign key
  can't, since seeded rows have no organisation.
- **Strength comes from the medicine.** Emzor Paracetamol 500 mg names the Paracetamol 500 mg tablet
  medicine; Emzor Paracetamol 1 g names the 1 g one. The product has no strength of its own to disagree.
- **Name and code stay on the item.** `BillableItem.name` is what staff search and what charges
  snapshot ("Emzor Paracetamol 500mg Tablet"); the medicine supplies the structured parts.
- **The manufacturer is picked from the hospital's list** (§5), or created on the spot, like a
  supplier. It must be the caller's own and active.
- **Can't be un-stocked** once it has a movement. Deactivate the item instead (`12` §4.2).
- **`BillableItem.unit` is locked once the item has a movement**: changing "tablet" to "strip"
  would silently multiply every balance. This is a new rule on `PATCH /billables/items/:id` (§19).
- **`batchTracked = false`** (e.g. eye glasses, some consumables): batch number and expiry are
  optional. Each receipt line still creates a batch row (with no number), so the ledger has one
  shape for everything and stock rotates first-in, first-out.

## 4. Units and Packs

```prisma
model ItemPack {
  id           String        @id @default(uuid())
  itemId       String
  name         String        // "Box of 100", "Strip of 10"
  unitsPerPack Int           // never edited; a new size is a new pack
  barcode      String?
  isDefault    Boolean       @default(false)
  status       CatalogStatus @default(ACTIVE)
  createdAt    DateTime      @default(now())
  createdBy    String
  updatedAt    DateTime      @updatedAt
  updatedBy    String?

  stockItem    StockItem     @relation(fields: [itemId], references: [itemId])
  receiptItems GoodsReceiptItem[]

  @@unique([itemId, name])
}
```

```sql
ALTER TABLE "ItemPack" ADD CONSTRAINT item_pack_units_positive CHECK ("unitsPerPack" > 0);
CREATE UNIQUE INDEX item_pack_one_default ON "ItemPack" ("itemId") WHERE "isDefault";
CREATE UNIQUE INDEX item_pack_barcode ON "ItemPack" ("barcode") WHERE "barcode" IS NOT NULL;
```

- **The base unit is always a valid "pack of 1"**; it isn't stored as a row.
- **Choose the base unit as the smallest unit ever supplied.** Tablets sold by the strip and the
  tablet: base unit "tablet". A syrup only ever handed over whole: base unit "bottle". A bulk liquid
  measured out: base unit "ml". That one choice is the explicit "can this be divided" rule; the
  system never converts beyond it.
- **`unitsPerPack` can't be edited.** A different pack size is a new pack; the old one is
  deactivated. Receipt lines snapshot the pack name and size anyway (§10.1), so history never
  depends on a pack row.
- `ItemCost` (`12` §5) already stores cost as `packCost + unitsPerPack`; receipts produce exactly
  that pair.

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

  @@unique([organizationId, name])
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

  @@unique([organizationId, name])
}
```

- Both are the hospital's own lists, picked from or added to while working (stocking an item,
  entering a receipt), so the same company isn't typed three ways.
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
- **Expiry is a date.** When the pack shows only a month ("EXP 03/2027"), the UI stores the last day
  of that month. Stock is **expired from the day after** its expiry date.
- **Batch number and expiry are corrected only through a request** while the batch has no movement
  other than its receipt; afterwards they're fixed (§24).
- **Quality applies everywhere at once.** Putting a batch `ON_HOLD` or `RECALLED` makes every unit
  of it ineligible (§8.2) in every location, with no movement. `RECALLED` is terminal and needs a
  `recallReference`.

## 7. Storage Locations

```prisma
model StorageLocation {
  id               String           @id @default(uuid())
  organizationId   String
  branchId         String
  code             String           // "MS", "OPD-DISP"
  name             String
  type             LocationType
  storageCondition StorageCondition @default(ROOM_TEMPERATURE)
  status           CatalogStatus    @default(ACTIVE)
  createdAt        DateTime         @default(now())
  createdBy        String
  updatedAt        DateTime         @updatedAt
  updatedBy        String?

  organization     Organization     @relation(fields: [organizationId], references: [id])
  branch           Branch           @relation(fields: [branchId], references: [id])
  balances         StockBalance[]
  movements        StockMovement[]
  receipts         GoodsReceipt[]
  receiptItems     GoodsReceiptItem[]

  @@unique([organizationId, code])
  @@unique([id, organizationId]) // target of balance and movement composite FKs
  @@index([organizationId, branchId])
}

enum LocationType {
  STORE
  DISPENSARY
  WARD
  THEATRE
  CLINIC
  OTHER
}
```

### 7.1 Rules

- **Flat per branch in v1.** Main Store, OPD Dispensary, Ward 3, Theatre. A hospital that wants a
  separate fridge counted on its own makes it a location ("Main Store Fridge", `REFRIGERATED`).
- **Nesting later is additive.** Shelves and fridges inside a store become a nullable `parentId`
  with a same-branch composite FK; existing stock and queries keep working.
- **Deactivating** needs the location to hold no stock (all balances zero). Inactive locations take
  no movements.
- **Storage condition** is recorded on both item and location; the UI warns on a mismatch when
  putting stock away. Whether to *reject* it is open (§24).

## 8. Balances, Status and Eligibility

### 8.1 `StockBalance`

```prisma
model StockBalance {
  id             String          @id @default(uuid())
  organizationId String
  branchId       String
  locationId     String
  itemId         String
  batchId        String
  status         StockStatus
  quantity       Int             @default(0)
  updatedAt      DateTime        @updatedAt

  location       StorageLocation @relation(fields: [locationId, organizationId], references: [id, organizationId])
  batch          StockBatch      @relation(fields: [batchId, organizationId], references: [id, organizationId])

  @@unique([locationId, batchId, status])
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
ALTER TABLE "StockBalance" ADD CONSTRAINT stock_balance_non_negative CHECK ("quantity" >= 0);
```

Balances are never written by application code; only the movement trigger (§9.2) writes them. A row
at zero is kept (it's the history's anchor); views filter `quantity > 0`.

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
  locationId     String
  itemId         String
  batchId        String
  status         StockStatus
  quantity       Int                                // signed base units; never 0
  createdAt      DateTime         @default(now())

  transaction    StockTransaction @relation(fields: [transactionId], references: [id])
  location       StorageLocation  @relation(fields: [locationId, organizationId], references: [id, organizationId])
  batch          StockBatch       @relation(fields: [batchId, organizationId], references: [id, organizationId])

  @@index([transactionId])
  @@index([batchId, createdAt])
  @@index([locationId, itemId, createdAt])
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
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_non_zero CHECK ("quantity" <> 0);

-- the only writer of StockBalance
CREATE FUNCTION apply_stock_movement() RETURNS trigger AS $$
BEGIN
  INSERT INTO "StockBalance" ("id", "organizationId", "branchId", "locationId", "itemId", "batchId",
                              "status", "quantity", "updatedAt")
  SELECT gen_random_uuid()::text, NEW."organizationId", l."branchId", NEW."locationId", NEW."itemId",
         NEW."batchId", NEW."status", NEW."quantity", now()
  FROM "StorageLocation" l WHERE l."id" = NEW."locationId"
  ON CONFLICT ("locationId", "batchId", "status")
  DO UPDATE SET "quantity" = "StockBalance"."quantity" + EXCLUDED."quantity", "updatedAt" = now();
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
    GROUP BY m."batchId" HAVING SUM(m."quantity") <> 0
  ) THEN RAISE EXCEPTION 'stock transaction % does not balance', NEW."transactionId"; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER stock_transaction_balanced AFTER INSERT ON "StockMovement"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_transaction_balanced();
```

What this buys:

- **Services only insert movements.** No read-then-write of a balance, no race: two people taking
  the last 10 capsules at once both run the trigger's `UPDATE`, and the second fails the
  `quantity >= 0` CHECK. The service turns that into a 409 *insufficient stock*.
- **Taking from nothing fails too**: a negative movement against a balance row that doesn't exist
  inserts a negative row, which fails the same CHECK.
- **Every balance equals the sum of its movements**, by construction. A reconciliation query
  (`/pharmacy/ledger/check`) proves it on demand.
- **Composite FKs** keep a movement's batch and location in its organisation.
- **`itemId` on the movement and balance** is copied from the batch so stock-by-item queries don't
  join; the service sets it from the batch it already loaded, and the batch FK stops it disagreeing
  in practice (a CHECK across tables isn't possible; the reconciliation query covers it).

### 9.3 Cost of a quantity

Movements store no money. A batch's **unit cost** is worked out from its receipt lines:
`Σ(packCost × packsAccepted) ÷ Σ(packsAccepted × unitsPerPack)` — a weighted average when one lot
arrived in several deliveries at different prices. Value of any quantity = quantity × unit cost,
**rounded half-up to 2 places once**, at the end of the sum (`12` D12). Opening stock carries its
own cost the same way. This gives stock valuation and, once Dispensing exists, cost of goods issued,
from the same rows.

## 10. Receiving

### 10.1 `GoodsReceipt`

```prisma
model GoodsReceipt {
  id                  String          @id @default(uuid())
  organizationId      String
  branchId            String
  number              String                         // "GRN-000123" (SequenceCounter "grn:<orgId>")
  type                ReceiptType     @default(DELIVERY)
  locationId          String                         // where it's received; lines may put away elsewhere in the branch
  supplierId          String?                        // required for DELIVERY
  supplierInvoiceNo   String?
  supplierInvoiceDate DateTime?       @db.Date
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
  location            StorageLocation  @relation(fields: [locationId], references: [id])
  supplier            Supplier?        @relation(fields: [supplierId], references: [id])
  transaction         StockTransaction? @relation(fields: [transactionId], references: [id])
  items               GoodsReceiptItem[]

  @@unique([organizationId, number])
  @@index([organizationId, status, receivedAt])
  @@index([supplierId, receivedAt])
}

model GoodsReceiptItem {
  id             String        @id @default(uuid())
  receiptId      String
  itemId         String
  packId         String?                            // the pack chosen; null = base unit
  packName       String                             // snapshot: "Box of 100"
  unitsPerPack   Int                                // snapshot
  packsDelivered Int
  packsAccepted  Int
  rejectReason   String?                            // required when fewer accepted than delivered
  packCost       Decimal       @db.Decimal(14, 2)   // as on the invoice line
  batchNumber    String?
  manufacturedOn DateTime?     @db.Date
  expiryDate     DateTime?     @db.Date
  locationId     String?                            // put-away override within the receipt's branch
  receiveAs      StockStatus   @default(AVAILABLE)  // AVAILABLE | QUARANTINE
  updateCost     Boolean       @default(true)       // roll ItemCost forward on posting (§11)
  keepCostReason String?                            // required when updateCost = false
  batchId        String?                            // set on posting
  itemCostId     String?                            // set when posting rolled the cost
  createdAt      DateTime      @default(now())

  receipt        GoodsReceipt     @relation(fields: [receiptId], references: [id], onDelete: Cascade)
  stockItem      StockItem        @relation(fields: [itemId], references: [itemId])
  pack           ItemPack?        @relation(fields: [packId], references: [id])
  location       StorageLocation? @relation(fields: [locationId], references: [id])
  batch          StockBatch?      @relation(fields: [batchId], references: [id])
  itemCost       ItemCost?        @relation(fields: [itemCostId], references: [id])

  @@index([receiptId])
  @@index([itemId])
  @@index([batchId])
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
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_units_positive CHECK ("unitsPerPack" > 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_packs_valid
  CHECK ("packsDelivered" >= 0 AND "packsAccepted" >= 0 AND "packsAccepted" <= "packsDelivered");
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_reject_reason
  CHECK ("packsAccepted" = "packsDelivered" OR "rejectReason" IS NOT NULL);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_pack_cost_non_negative CHECK ("packCost" >= 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_receive_as CHECK ("receiveAs" IN ('AVAILABLE', 'QUARANTINE'));
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT gri_keep_cost_reason
  CHECK ("updateCost" OR "keepCostReason" IS NOT NULL);
```

### 10.2 Flow

1. **Draft.** Staff enter the delivery as it appears on the invoice and in the boxes: supplier,
   invoice number, and per line the product, pack, packs delivered, packs accepted, pack cost, batch
   number, expiry. A draft is freely editable and changes no stock. `receiveAs`
   defaults from `StockItem.quarantineOnReceipt`.
2. **Post** (`pharmacy.receipt.post`), in one database transaction:
   - validates every line (below) and reports **all** failing lines in one 400;
   - finds or creates each line's batch (§6.1) and sets `batchId`;
   - writes one `RECEIPT` (or `OPENING`) transaction with a `+packsAccepted × unitsPerPack`
     movement per line at its location and `receiveAs` status; the trigger updates the balances;
   - rolls `ItemCost` forward where due (§11) and sets `itemCostId`;
   - stamps `postedAt/postedBy` and the `transactionId`.
3. **Posted receipts are immutable.** A wrong quantity is corrected by an adjustment (§14), wrong
   goods by a supplier return. A wrong batch number or expiry, see §6.1.

**Validation at posting:**

- item is stocked and `ACTIVE`; pack (if given) is the item's and `ACTIVE`;
- `batchTracked` items have a batch number and expiry;
- **expiry is after `receivedAt`**: expired goods can't be accepted (reject them on the line);
- line location is active and in the receipt's branch;
- supplier active (for `DELIVERY`);
- lines for the same lot agree on expiry, and agree with the existing batch row.

**Only accepted stock enters inventory.** `packsDelivered` vs `packsAccepted` with a `rejectReason`
records short-dated, broken or wrong items handed back to the driver; the difference never touches a
balance. Shortfalls against an order (slice 3) are the PO's concern: the receipt records what came.

**Opening stock** is a receipt of type `OPENING`: no supplier, but a cost per line so the stock can
be valued and markup items priced from day one. Typically one per location at go-live; a bulk
import (CSV) builds on the same endpoint (§23).

## 11. Cost and Price

`12` prices drugs and consumables as `MARKUP` on the item's cost in effect (`12` §5–6) and left open
whether receipts feed that cost. Decision *(proposed)*:

- **The price stays per item.** If markup read the batch's cost, the same capsule would have two
  prices on the same day depending on which lot the pharmacist picked. Patients and HMOs won't
  accept that, and FEFO would change the bill.
- **Posting a receipt rolls `ItemCost` forward.** For each item on the receipt with `updateCost` lines:
  - if the item has no cost in effect, a new `ItemCost` row starts now;
  - if the line's unit cost (`packCost ÷ unitsPerPack`) **equals** the current cost's, nothing
    changes (no churn on repeat buys at the same price);
  - otherwise the current row is ended now and a new row starts now with the line's `packCost` and
    `unitsPerPack`, `source` = the GRN number and supplier invoice, `reason` = "Goods receipt
    GRN-000123". Every `MARKUP` line reprices from that moment, as `12` §5.3 intends.
  - Several `updateCost` lines for the same item on one receipt must carry the same unit cost;
    otherwise the post is a 400 asking for all but one to be unticked.
- **Effective from posting, not `receivedAt`.** `12` forbids backdating cost, and charges may already
  have been posted at the old cost in between.
- **Unticking `updateCost`** needs `keepCostReason` (a one-off cheap buy, donated stock). The batch
  still carries its real cost for valuation (§9.3).
- **The receipt's posting permission covers the cost roll.** The person who posts a receipt doesn't
  also need `billable.cost.create`; the roll is part of the receipt and is traceable to it through
  `GoodsReceiptItem.itemCostId`.

Acquisition cost (batch, receipt line), cost in effect (`ItemCost`), selling price (`ItemPrice`), and
what the patient finally pays (charge and allocation, `13`) stay four separate things.

## 12. Rotation, Expiry and the Issue Contract

### 12.1 FEFO

A pure rule, `allocateFefo(balances, quantity, today)` in `inventory.rules.ts`, picks the batches
for any quantity leaving a location when the caller doesn't name a batch:

1. keep only eligible balances (§8.2) at the location;
2. order by `expiryDate` ascending (no expiry last), then batch `firstReceivedAt`, then batch id;
3. take from each until the quantity is met;
4. return the picks `[{ batchId, locationId, quantity }]`, or the shortfall and what is eligible.

The picks become one movement each, so **a quantity drawn from several batches records the amount
from each**. A caller may name a batch (e.g. the dispensary is finishing an opened carton); the
eligibility rules still apply.

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
  locationId: string;                       // the location it leaves from
  sourceType: string; sourceId: string;     // the dispensing record / ward usage line
  lines: { itemId: string; quantity: number; batchId?: string }[];
}): Promise<{ transactionId: string; picks: { itemId; batchId; locationId; quantity }[] }>
```

It runs FEFO, inserts `ISSUE` movements and returns the picks for the caller to store against its
own record (batch traceability for recalls). `returnIssue` reverses part of an issue as
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
  quantitySent     Int
  quantityReceived Int?
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
  CHECK ("quantitySent" > 0 AND ("quantityReceived" IS NULL OR "quantityReceived" BETWEEN 0 AND "quantitySent"));
ALTER TABLE "StockTransferLine" ADD CONSTRAINT transfer_line_discrepancy_note
  CHECK ("quantityReceived" IS NULL OR "quantityReceived" = "quantitySent" OR "discrepancyNote" IS NOT NULL);
```

- **Dispatch** (`pharmacy.transfer.dispatch`): lines by item and quantity (FEFO picks batches) or by
  batch. Only eligible stock is sent. One `TRANSFER_DISPATCH` transaction: −n `AVAILABLE` at the
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
  locationId   String
  batchId      String
  itemId       String
  status       StockStatus
  quantity     Int                              // signed; −10 = write 10 off

  adjustment   StockAdjustment @relation(fields: [adjustmentId], references: [id], onDelete: Cascade)

  @@unique([adjustmentId, locationId, batchId, status])
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
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT adjustment_line_non_zero CHECK ("quantity" <> 0);
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
  locationId     String                         // the location counted
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
  locationId      String
  batchId         String
  itemId          String
  status          StockStatus                  // AVAILABLE | QUARANTINE | DAMAGED
  systemQuantity  Int                          // balance when this line was counted
  countedQuantity Int
  countedBy       String
  countedAt       DateTime   @default(now())
  note            String?

  count           StockCount @relation(fields: [countId], references: [id], onDelete: Cascade)

  @@unique([countId, locationId, batchId, status])
}

enum StockCountStatus {
  OPEN
  SUBMITTED
  APPROVED
  CANCELLED
}
```

```sql
ALTER TABLE "StockCountLine" ADD CONSTRAINT count_line_non_negative CHECK ("countedQuantity" >= 0);
ALTER TABLE "StockCount" ADD CONSTRAINT count_maker_checker
  CHECK ("approvedBy" IS NULL OR "approvedBy" <> "submittedBy");
```

- **No freeze.** The pharmacy keeps working during a count. Each line snapshots the system quantity
  *at the moment it's counted*, so the variance is `counted − systemQuantity`, unaffected by
  dispensing before or after.
- **Approval posts** one `COUNT_VARIANCE` transaction with a movement per non-zero variance. Only
  counted lines are touched; anything not counted is left alone, and the count report lists balances
  in scope that weren't counted.
- Blind counts hide `systemQuantity` from counters; supervisors see it on review.

## 16. Reorder Levels

```prisma
model StockLevel {
  id              String          @id @default(uuid())
  organizationId  String
  itemId          String
  locationId      String                       // a store, dispensary or ward
  minQuantity     Int                          // below this = low stock
  reorderQuantity Int?                         // suggested order, base units
  maxQuantity     Int?
  updatedAt       DateTime        @updatedAt
  updatedBy       String?

  stockItem       StockItem       @relation(fields: [itemId, organizationId], references: [itemId, organizationId])
  location        StorageLocation @relation(fields: [locationId, organizationId], references: [id, organizationId])

  @@unique([itemId, locationId])
}
```

`GET /pharmacy/low-stock` compares eligible stock at each level.s location with
`minQuantity`, and shows stock in transit to it. Purchase-order suggestions build on it (slice 3).

## 17. Permissions

`pharmacy.*` in `src/access-control/permissions.catalog.ts`, one key per job.

| Key | Name | Grants |
|---|---|---|
| `pharmacy.stock.view` | Pharmacy: View Stock | Stocked items, packs, locations, suppliers, manufacturers, drugs, batches, balances, movements, receipts, transfers, adjustments, counts, expiry and low-stock views |
| `pharmacy.medicine.manage` | Manage Hospital Medicines | Add or edit the hospital's own medicines (never seeded ones) |
| `pharmacy.item.manage` | Manage Stock Items | Stock settings, medicine link, brand and maker, packs, reorder levels |
| `pharmacy.location.manage` | Manage Storage Locations | Create, edit, deactivate locations |
| `pharmacy.supplier.manage` | Manage Suppliers & Manufacturers | Suppliers and manufacturers |
| `pharmacy.receipt.create` | Record Goods Receipt | Create, edit and cancel draft receipts (incl. opening stock) |
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

**Cost visibility** reuses `billable.cost.view` (`12` §10): without it, responses leave out pack
costs, batch costs and values. The exception is a receipt's own lines, which holders of
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
| `/medicines/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.medicine.manage` | Detail with its uses and the hospital's products / edit own medicine (seeded rows: 403) |
| `/items` | GET | `pharmacy.stock.view` | Stocked items with category, medicine, strength, brand, stock totals (§8.2) for `locationId?` / `branchId?`; filter `kind`, `categoryId`, `medicineId`, `search` (code, name, brand, generic name), `lowStock`, `status` |
| `/items/:itemId` | PUT | `pharmacy.item.manage` | Make an item stocked / update settings: `batchTracked`, `quarantineOnReceipt`, `storageCondition`, `medicineId` (required for `PHARMACY` items), `brandName?`, `manufacturerId?`, `registrationNo?` |
| `/items/:itemId` | GET | `pharmacy.stock.view` | Settings, drug, packs, levels, totals |
| `/items/:itemId/stock` | GET | `pharmacy.stock.view` | Balances by batch × location × status, with eligibility, expiry and (cost view) value |
| `/items/:itemId/packs` | POST / GET | `pharmacy.item.manage` / `pharmacy.stock.view` | Add pack (`name`, `unitsPerPack`, `barcode?`, `isDefault?`) / list |
| `/packs/:id` | PATCH | `pharmacy.item.manage` | `name`, `barcode`, `isDefault`, `status` (never `unitsPerPack`) |
| `/items/:itemId/levels` | PUT / GET | `pharmacy.item.manage` / `pharmacy.stock.view` | Set / list reorder levels per location |
| `/locations` | POST / GET | `pharmacy.location.manage` / `pharmacy.stock.view` | Create / list for `branchId?` |
| `/locations/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.location.manage` | Detail with stock summary / edit, deactivate |
| `/suppliers`, `/manufacturers` | POST / GET | `pharmacy.supplier.manage` / `pharmacy.stock.view` | Create / list (`search`, `status`) |
| `/suppliers/:id`, `/manufacturers/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.supplier.manage` | Detail / edit, deactivate |
| `/receipts` | POST / GET | `pharmacy.receipt.create` / `pharmacy.stock.view` | Draft with lines / list (filter `status`, `supplierId`, `type`, dates) |
| `/receipts/:id` | GET / PATCH | `pharmacy.stock.view` / `pharmacy.receipt.create` | Detail / edit draft (header and lines replaced as a set) |
| `/receipts/:id/post` | POST | `pharmacy.receipt.post` | Post (§10.2); 400 lists every failing line |
| `/receipts/:id/cancel` | POST | `pharmacy.receipt.create` | Cancel a draft (`reason`) |
| `/batches` | GET | `pharmacy.stock.view` | Search by `itemId`, `batchNumber`, `qualityStatus`, expiry range |
| `/batches/:id` | GET | `pharmacy.stock.view` | Batch with balances, receipt lines, movements, cost (cost view) |
| `/batches/:id/quality` | POST | `pharmacy.batch.quality` | `status`, `reason`, `recallReference?` |
| `/status-changes` | POST | `pharmacy.stock.status` / `pharmacy.stock.release` per §8.3 | `{ locationId, lines: [{ batchId, from, to, quantity }], reason }` |
| `/transfers` | POST / GET | `pharmacy.transfer.dispatch` / `pharmacy.stock.view` | Dispatch / list (filter `status`, `fromLocationId`, `toLocationId`) |
| `/transfers/:id` | GET | `pharmacy.stock.view` | Detail |
| `/transfers/:id/receive` | POST | `pharmacy.transfer.receive` | `{ lines: [{ lineId, quantityReceived, discrepancyNote? }] }` |
| `/transfers/:id/cancel` | POST | `pharmacy.transfer.dispatch` | Before receipt (`reason`) |
| `/adjustments` | POST / GET | `pharmacy.adjustment.request` / `pharmacy.stock.view` | Request / list (filter `status`, `reason`) |
| `/adjustments/:id` | GET | `pharmacy.stock.view` | Detail with value (cost view) |
| `/adjustments/:id/approve`, `/reject`, `/cancel` | POST | `…approve` / `…approve` / `…request` | Decide (`note`) / withdraw own |
| `/counts` | POST / GET | `pharmacy.count.manage` / `pharmacy.stock.view` | Start (`locationId`, `categoryId?`, `blind`) / list |
| `/counts/:id/lines` | PUT | `pharmacy.count.manage` | Record counted lines (upsert by location + batch + status) |
| `/counts/:id/submit`, `/approve`, `/cancel` | POST | `…manage` / `…approve` / `…manage` | Lifecycle |
| `/movements` | GET | `pharmacy.stock.view` | Ledger: filter `itemId`, `batchId`, `locationId`, `type`, dates |
| `/expiry` | GET | `pharmacy.stock.view` | §12.2: `locationId?`, `withinDays?` (default org setting) |
| `/low-stock` | GET | `pharmacy.stock.view` | §16 |
| `/valuation` | GET | `pharmacy.stock.view` + `billable.cost.view` | Stock value by item / category / location at now (§9.3) |
| `/ledger/check` | GET | `pharmacy.stock.view` | Balances that don't equal their movements (should be none) |
| `/metrics` | GET | `pharmacy.stock.view` | Overview: stocked items, low stock, expiring, expired, quarantine, pending adjustments, transfers in transit |

## 19. Code Layout and Changes to Existing Models

**Module**: `src/inventory/` (`items`, `locations`, `suppliers`, `receipts`, `batches`, `movements`,
`transfers`, `adjustments`, `counts`, `inventory.rules.ts` + `inventory.rules.spec.ts` for FEFO,
eligibility, cost roll, unit conversion and transfer/adjustment state rules). It imports
`BillablesModule` to read items and roll `ItemCost`. Dispensing (the existing `src/pharmacy/` stub)
will import Inventory; nothing imports in the other direction. DTOs in
`src/shared/contracts/inventory`, enum mirrors in `src/shared/enums/inventory`.

| Current | Becomes |
|---|---|
| — | `Medicine`, `TherapeuticUse`, `MedicineTherapeuticUse` (seeded), `StockItem`, `ItemPack`, `Supplier`, `Manufacturer`, `StockBatch`, `StorageLocation`, `StockBalance`, `StockTransaction`, `StockMovement`, `GoodsReceipt`, `GoodsReceiptItem` (slice 1); `StockTransfer(Line)`, `StockAdjustment(Line)`, `StockCount(Line)`, `StockLevel` (slice 2); enums as above |
| `BillableItem` | Gains `stockItem` relation. **`unit` can't change once the item has a movement** (rule added to `PATCH /billables/items/:id`) |
| `ItemCost` | Gains `receiptItems` relation (`GoodsReceiptItem.itemCostId`). No new columns |
| `Organization` | Gains `nearExpiryDays Int @default(90)` and relations `medicines`, `suppliers`, `manufacturers`, `storageLocations`, `goodsReceipts` |
| `Branch` | Gains `storageLocations`, `goodsReceipts`, `stockTransactions` relations |
| `prisma/seed.ts` | Seeds medicines and their therapeutic uses from `prisma/data/medicines/medicines-*.json`, insert-only (`organizationId` null, `createdBy` null) |
| `SequenceCounter` | New scopes `grn:<orgId>`, `trf:<orgId>`, `adj:<orgId>`, `cnt:<orgId>` |
| `permissions.catalog.ts` | §17 keys; seeded profiles as in §17 |
| Migration | Prisma tables + appended SQL from §3.1, §4, §6, §8.1, §9.2, §10.1, and, in slice 2, §13, §14.1, §15 |

## 20. Slices

1. **Stock in.** Seeded drugs (plus hospital-added ones), stocked items, packs, suppliers, manufacturers, locations, receipts
   (delivery and opening) with batches and the cost roll, the ledger with its triggers, status
   changes (quarantine release), batch quality, and the stock / batch / movement / expiry / valuation
   views. FEFO and the `issue` method with their specs (no endpoint yet).
2. **Stock control.** Transfers, adjustments and write-offs, stocktake, reorder levels
   and low stock.
3. **Procurement.** Purchase orders (draft → approved → sent → partly/fully received → closed),
   receipts against PO lines, reorder suggestions, supplier returns, recall report across issues.
4. **Dispensing PRD** consumes §12.3.

## 21. Worked Example

Amoxicillin 500 mg Capsule `DRG-AMX500` (category "Antibiotics", kind `PHARMACY`), base unit
"capsule"; packs "Box of 100" (default) and "Strip of 10". Self-pay `MARKUP` 30%. Locations at the
main branch: Main Store `MS`, OPD Dispensary `OPD`.

| Event | Ledger | Stock afterwards | Cost / price |
|---|---|---|---|
| GRN-000101 from Alpha Pharma: 20 boxes delivered, 19 accepted (1 crushed), lot `A123` exp 2027-06-30, ₦3,500.00/box → `MS` | `RECEIPT` +1,900 `A123` `MS` AVAILABLE | `MS`: A123 1,900 | First `ItemCost` 3,500.00/100 → self-pay **₦45.50** |
| GRN-000108: 10 boxes, lot `B456` exp 2027-03-31, ₦3,800.00/box | `RECEIPT` +1,000 `B456` `MS` | `MS`: A123 1,900 · B456 1,000 | Cost rolled at posting: 3,800.00/100 → **₦49.40**. A123 still valued at ₦35.00/capsule |
| Transfer TRF-000045 `MS` → `OPD`, 1,200 capsules, no batch named | `TRANSFER_DISPATCH`: FEFO takes B456 (earlier expiry) 1,000 + A123 200; −at `MS` AVAILABLE, +at `OPD` IN_TRANSIT | `MS`: A123 1,700 · `OPD` in transit 1,200 | Total still 2,900 |
| OPD receives 1,180 (one strip of 20 missing) | `TRANSFER_RECEIVE` IN_TRANSIT → AVAILABLE 1,180; ADJ-000017 `LOSS` −20 raised, pending | `OPD`: 1,180 available, 20 in transit | — |
| Auditor approves ADJ-000017 | `ADJUSTMENT` −20 at `OPD` IN_TRANSIT | `OPD`: 1,180 | Loss valued at ₦760.00 (B456 at ₦38.00) |
| NAFDAC recalls lot `A123` | No movement; batch `RECALLED` | `MS` A123 1,700 + `OPD` A123 ineligible at once | — |
| Dispensing (later) issues 30 capsules at `OPD` | `ISSUE` picks B456 only (A123 recalled) | — | Charged ₦49.40 × 30 = ₦1,482.00 by the dispensing flow |

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
- **Why integers in base units.** Fractions of a tablet in a balance are always a mistake; items
  that are genuinely measured pick a measurable base unit (ml).
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
- **Barcode / GS1 scanning and serialisation**; `ItemPack.barcode` is stored for later.
- **Consignment and donated-stock accounting** beyond `keepCostReason`.
- **Temperature logging** for cold chain.
- **Controlled-drug register** (running balance per drug signed by two people) — needs its own rules.
- **Branch-specific prices** (`12` §16).

## 24. Open Decisions

1. **D9 cost roll default** *(proposed)*: receipts update `ItemCost` unless unticked. Alternative:
   cost changes only by hand in Billables.
2. **D12 approval** *(proposed)*: every adjustment needs a second person. Alternatives: only above a
   value threshold (per-profile limits like `ApprovalLimit`), or write-offs only.
3. **Storage condition**: warn (proposed) or reject when a fridge item is put on a room-temperature
   shelf.
4. **Minimum remaining shelf life on receipt** (e.g. reject < 6 months unless overridden): an
   `Organization` setting or not at all.
5. **Location ↔ department/clinic link**: which dispensary serves which queue. Likely needed by
   Dispensing; could be `StorageLocation.departmentId?` added then.
6. **Correcting a batch's number or expiry** after it has moved: never (proposed: adjust out and
   re-receive) or via an approved request.
7. **Purchase orders before slice 3**: if the hospital's procurement process requires a PO before
   any receipt, slice 3 moves ahead of slice 2.
