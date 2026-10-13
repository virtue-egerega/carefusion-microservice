# Feature PRD — Billing Accounts, Coverage & Reconciliation

Status: Draft · Last updated: 2026-10-13
Depends on: `02-hospital-onboarding.md` (`Organization`, `Branch`), `04-departments.md` (Accounts
department, `Queue`), `05-access-control-clinical-scoping.md` (`Permission`, `DutyProfile`),
`06-patient-management.md` (`Patient`, `PatientRelationship`), `07-appointment-management.md`
(`Appointment` — the visit a charge belongs to).
Supersedes: `06` §2.6 `PatientAccount`; the current `User.balance`, `Transaction`,
`InsuranceScheme`, `Patient.billingtype` and `Patient.insuranceSchemeId` (§11).

This document defines who pays for care, how each bill is split between them, how payments are
matched back to bills, and how money is forgiven (written off) under signed-off control. It does
not define the price catalog, claim file formats, or invoice layouts (§15).

## 1. Decisions Record

Agreed during design review, 2026-10-13. Each is elaborated in the section shown.

| # | Decision | § |
|---|---|---|
| D1 | Billing responsibility is separated from the patient record. `Patient` holds clinical identity only, with no balance, billing type or scheme. | 2 |
| D2 | Out-of-pocket money lives in a `BillingAccount`, which is `INDIVIDUAL` or `FAMILY`. A family account can cover several patients from one shared balance. | 3 |
| D3 | All third-party payers use one model: HMO, NHIS/government, a company on retainership, or the hospital's own staff cover. Corporate benefits that extend to spouses and children are a plan with dependant rules, exactly like insurance. Payers differ only in `settlementMode`. | 4 |
| D4 | Coverage is per person (`Coverage`), not per account. Payers issue enrolment numbers, eligibility and authorisation per person, and one household can be split across payers. | 4.4 |
| D5 | **Copay is the patient's share.** "10% copay" means the patient pays 10% and the payer pays 90%, the same convention as NHIS's 10% drug copayment. Copay can differ by service category. | 4.2 |
| D6 | Caps exist per member, per policy (the family-wide limit) and per category, and are enforced at the moment of charging. | 4.2, 6.4 |
| D7 | **Every bill is recorded as a `Charge`, whatever its coverage**: insured, self-pay, staff cover or waived. Every naira of every charge is always owned by exactly one party: a payer, a billing account, or the hospital (after an approved write-off). | 5, 6 |
| D8 | Payers have an account and ledger with the same mechanics as families. Payer charges debit it, and payer payments (remittances) credit it. | 3, 7 |
| D9 | **A payment short of the invoiced amount is still owed, not written off.** Ownership only changes when the payer rejects a line or someone approves a write-off. | 7.3 |
| D10 | Payer payments are matched line by line when the payer sends an itemised payment advice (HMO/NHIS). Otherwise they are applied oldest bill first (corporate statements). A per-line paid/unpaid status is kept either way, so every shortfall can be traced to a specific line. | 7 |
| D11 | **Nothing is written off without a documented request, a reason, supporting evidence and a sign-off** from someone else who holds the permission and the approval limit for that amount. Every write-off is permanent and appears in the write-off register. | 8 |
| D12 | The same approval process controls every other action that moves or forgives money: refunds, adjustments, charge voids, transfers between accounts, credit-limit changes, and recovering a written-off debt. | 8 |
| D13 | Hospital staff cover is still billed as a payer, so caps keep working. It is written off through a signed-off batch request at period close, never automatically. | 8.6 |
| D14 | Three queues are added under the Accounts department: **Cashier**, **Insurance**, and **Write-offs & Approvals**, along with the permissions they need. | 9, 10 |

## 2. What Problem This Solves

Today the patient record carries its own money and its own payer (`User.balance`,
`Transaction.userId`, `Patient.billingtype`, `Patient.insuranceSchemeId`). That breaks as soon as
real payment arrangements show up:

- **Families pool money.** A mother deposits ₦20,000 and expects the whole family's visits to
  draw from it.
- **Employers pay for staff and their dependants**, up to annual limits, sometimes with separate
  limits on drugs or admissions. That is structurally identical to HMO cover.
- **Insurance is per person** and changes over time, while the clinical record must not.
- **Payers pay late, pay less, and reject lines.** Without a record of which party owes each part
  of every bill, a shortfall can't be traced and money disappears.

The model separates three questions:

| Question | Answered by |
|---|---|
| What was billed? | `Charge` (§5) |
| Who owes which part of it? | `ChargeAllocation` (§6) |
| Who has paid, and what's still owed? | `BillingAccount` + `AccountEntry` + `PaymentApplication` (§3, §7) |

## 3. Billing Accounts and the Ledger

### 3.1 `BillingAccount`

One ledger structure for everyone who can owe the hospital money.

```prisma
model BillingAccount {
  id              String             @id @default(uuid())
  organizationId  String
  accountNumber   String             @unique   // printed on the family card / payer statements
  accountType     BillingAccountType
  name            String                       // "The Okafor Family", "Acme Corp"
  holderPatientId String?                      // guarantor for INDIVIDUAL/FAMILY, if a patient
  holderName      String?                      // guarantor who isn't a patient
  holderPhone     String[]
  payerId         String?            @unique   // set iff accountType = PAYER
  balance         Decimal            @default(0.00) // cached: credits − debits; negative = owed
  unappliedCredit Decimal            @default(0.00) // cached: credit not yet applied to any bill
  creditLimit     Decimal            @default(0.00) // outstanding amount tolerated before service is gated (§6.6)
  status          AccountStatus      @default(ACTIVE)
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  updatedBy       String?

  organization    Organization       @relation(fields: [organizationId], references: [id])
  holder          Patient?           @relation("AccountHolder", fields: [holderPatientId], references: [id])
  payer           Payer?             @relation(fields: [payerId], references: [id])
  members         BillingAccountMember[]
  entries         AccountEntry[]

  @@index([organizationId, accountType, status])
}

enum BillingAccountType {
  INDIVIDUAL
  FAMILY
  PAYER
}

enum AccountStatus {
  ACTIVE
  SUSPENDED   // no new charges may post; payments still accepted
  CLOSED
}
```

- **Scoped to the organization, not the branch.** Family members register at different branches.
- **`creditLimit` doesn't block posting a charge.** It decides whether a service may go ahead
  while money is owed (§6.6). A family is usually 0 (prepaid). A corporate payer is usually large
  (invoiced monthly). Changing it requires an approved request (§8).

### 3.2 `BillingAccountMember`

Only `INDIVIDUAL` and `FAMILY` accounts have members.

```prisma
model BillingAccountMember {
  id        String    @id @default(uuid())
  accountId String
  patientId String
  joinedAt  DateTime  @default(now())
  leftAt    DateTime?                       // null = current member
  createdBy String

  account   BillingAccount @relation(fields: [accountId], references: [id])
  patient   Patient        @relation(fields: [patientId], references: [id])

  @@index([patientId, leftAt])
}
```

**Invariant: every patient has exactly one membership with `leftAt = null`.** Registration
creates an `INDIVIDUAL` account unless reception attaches the patient to an existing `FAMILY`
account. It's enforced in the migration with a partial unique index
(`UNIQUE (patient_id) WHERE left_at IS NULL`), since Prisma can't express one. Moving a patient
closes the old membership and opens a new one. Past charges stay with the account they were
billed to (§5).

### 3.3 `AccountEntry` (the ledger)

```prisma
model AccountEntry {
  id            String           @id @default(uuid())
  accountId     String
  patientId     String?                      // whose care it relates to; null for deposits/remittances
  entryType     AccountEntryType
  amount        Decimal                      // signed: + credit, − debit
  balanceAfter  Decimal
  allocationId  String?                      // the ChargeAllocation this debit/credit concerns
  requestId     String?                      // the approved FinancialRequest that authorised it (§8)
  reversesId    String?          @unique
  modeOfPayment PaymentMode?
  reference     String?                      // POS slip, transfer ref, payer remittance ref
  description   String
  branchId      String
  createdAt     DateTime         @default(now())
  createdBy     String

  account       BillingAccount   @relation(fields: [accountId], references: [id])

  @@index([accountId, createdAt])
  @@index([patientId, createdAt])
}

enum AccountEntryType {
  DEPOSIT        // money received from a patient/family     (+)
  REMITTANCE     // money received from a payer               (+)
  CHARGE         // an allocation billed to this account      (−)
  WRITE_OFF      // approved forgiveness of an allocation      (+)  requires requestId
  REFUND         // money paid back out                        (−)  requires requestId
  TRANSFER_IN    //                                            (+)  requires requestId
  TRANSFER_OUT   //                                            (−)  requires requestId
  ADJUSTMENT     //                                            (±)  requires requestId
  REVERSAL       // reverses an earlier entry                  (±)
}

enum PaymentMode {
  CASH
  POS
  TRANSFER
  ONLINE
  CHEQUE
}
```

- **Entries are immutable.** A correction is a `REVERSAL` pointing at the original entry.
- **The database rejects any `WRITE_OFF`, `REFUND`, `TRANSFER_*` or `ADJUSTMENT` entry without a
  `requestId`** (a CHECK constraint, not just service code). This is what makes D11/D12 hold no
  matter which code path posts the entry.
- Posting an entry updates `balance` and `unappliedCredit` in the same transaction, with the
  account row locked (`SELECT … FOR UPDATE`).

## 4. Coverage (third-party payers)

```
Payer            who pays                          "Acme Corp", "AXA Mansard HMO", "NHIS"
 └─ Plan         benefits, copay, caps, dependants "Acme – Staff"
     └─ Policy   one enrolment, one principal       Acme staff ID 4471, principal: Chidi Okafor
         └─ Coverage   one covered person           Chidi (PRINCIPAL), Ada (SPOUSE), Obi (CHILD)
```

### 4.1 `Payer` (replaces `InsuranceScheme`)

```prisma
model Payer {
  id              String         @id @default(uuid())
  organizationId  String
  name            String
  payerType       PayerType
  settlementMode  SettlementMode
  contactName     String?
  phone           String[]
  email           String?
  address         String?
  paymentTermDays Int?                       // e.g. 30 for a monthly corporate statement
  status          AccountStatus  @default(ACTIVE)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  account         BillingAccount?            // the PAYER ledger, created with the payer
  plans           Plan[]

  @@unique([organizationId, name])
}

enum PayerType {
  HMO
  GOVERNMENT   // NHIS / state schemes
  CORPORATE    // company on retainership
  STAFF        // the hospital covering its own employees
}

enum SettlementMode {
  CLAIMS          // payer reviews and decides line by line; itemised payment advice
  DIRECT_INVOICE  // payer is sent a periodic statement and pays the total
  INTERNAL        // nothing is collected; covered amounts are written off by approved batch (§8.6)
}
```

`payerType` says who the payer is, for reporting. `settlementMode` controls behaviour. A large
corporate may insist on claims-style review, so the two are deliberately separate fields.

### 4.2 `Plan` and `PlanBenefit`

```prisma
model Plan {
  id                   String          @id @default(uuid())
  payerId              String
  name                 String
  copayPercent         Decimal         @default(0)   // PATIENT's share, 0–100 (D5)
  annualLimitPerMember Decimal?                      // null = no cap
  annualLimitPerPolicy Decimal?                      // family-wide cap; null = none
  overLimitAction      OverLimitAction @default(BILL_TO_ACCOUNT)
  maxSpouses           Int             @default(0)
  maxChildren          Int             @default(0)
  childMaxAge          Int?
  allowOtherDependants Boolean         @default(false)
  status               AccountStatus   @default(ACTIVE)
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  payer                Payer           @relation(fields: [payerId], references: [id])
  benefits             PlanBenefit[]
  policies             Policy[]
}

enum OverLimitAction {
  BILL_TO_ACCOUNT    // excess falls to the patient's billing account
  REQUIRE_APPROVAL   // excess waits for payer approval in the Insurance queue (§6.3)
}

model PlanBenefit {
  id              String          @id @default(uuid())
  planId          String
  category        ServiceCategory
  covered         Boolean         @default(true)
  copayPercent    Decimal?                         // overrides Plan.copayPercent for this category
  annualLimit     Decimal?                         // per member, within this category
  requiresPreAuth Boolean         @default(false)

  plan            Plan            @relation(fields: [planId], references: [id], onDelete: Cascade)
  @@unique([planId, category])
}

enum ServiceCategory {
  REGISTRATION
  CONSULTATION
  LABORATORY
  RADIOLOGY
  PHARMACY
  PROCEDURE
  THEATRE
  ADMISSION
  OTHER
}
```

- **Copay (D5).** "10% copay" is stored as `copayPercent = 10`: the patient pays 10%, the payer
  90%. The per-category override exists because real plans differ by service. NHIS, for example,
  charges the 10% copay on drugs only (`PlanBenefit(PHARMACY, copayPercent = 10)` on a plan whose
  own `copayPercent` is 0).
- If a category has no `PlanBenefit` row, it's covered at the plan's copay with no category cap.
  Exclusions are explicit rows with `covered = false`.

### 4.3 `Policy`

```prisma
model Policy {
  id                 String       @id @default(uuid())
  planId             String
  policyNumber       String                    // HMO policy no., staff ID, NHIS no.
  principalPatientId String
  validFrom          DateTime
  validTo            DateTime?
  status             PolicyStatus @default(ACTIVE)
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  updatedBy          String?

  plan               Plan         @relation(fields: [planId], references: [id])
  principal          Patient      @relation("PolicyPrincipal", fields: [principalPatientId], references: [id])
  coverages          Coverage[]

  @@unique([planId, policyNumber])
}

enum PolicyStatus {
  ACTIVE
  SUSPENDED
  TERMINATED
}
```

The benefit year for caps starts at `validFrom` and repeats every year after.

### 4.4 `Coverage`

```prisma
model Coverage {
  id           String       @id @default(uuid())
  policyId     String
  patientId    String
  memberType   MemberType
  memberNumber String?                      // enrollee number on the HMO card
  priority     Int          @default(1)     // 1 = default when a patient has several
  validFrom    DateTime
  validTo      DateTime?
  status       PolicyStatus @default(ACTIVE)
  createdAt    DateTime     @default(now())
  createdBy    String

  policy       Policy       @relation(fields: [policyId], references: [id])
  patient      Patient      @relation(fields: [patientId], references: [id])

  @@unique([policyId, patientId])
  @@index([patientId, status])
}

enum MemberType {
  PRINCIPAL
  SPOUSE
  CHILD
  OTHER_DEPENDANT
}
```

**Enrolment rules** (checked when a dependant is added):
- The policy has exactly one `PRINCIPAL` coverage.
- Active `SPOUSE`/`CHILD` counts are within `maxSpouses`/`maxChildren`.
- A `CHILD` is younger than `childMaxAge`, if set. A nightly job sets `validTo` on children who age
  out.
- `OTHER_DEPENDANT` requires `allowOtherDependants`.
- A matching `PatientRelationship` (`06` §2.5) is shown to reception as confirmation, but isn't
  required. The payer's enrolment list is the authority.

## 5. Charges: one record per bill, always

```prisma
model Charge {
  id               String          @id @default(uuid())
  patientId        String
  branchId         String
  appointmentId    String?                     // the 07 visit
  billingAccountId String                      // patient's account at posting time (snapshot)
  coverageId       String?                     // coverage applied; null = self-pay
  category         ServiceCategory
  description      String
  quantity         Int             @default(1)
  unitPrice        Decimal
  amount           Decimal                     // quantity × unitPrice
  sourceType       String                      // "LAB_ORDER", "PRESCRIPTION", "REGISTRATION", ...
  sourceId         String
  status           ChargeStatus    @default(POSTED)
  createdAt        DateTime        @default(now())
  createdBy        String

  allocations      ChargeAllocation[]

  @@index([patientId, createdAt])
  @@index([billingAccountId, createdAt])
  @@index([sourceType, sourceId])
}

enum ChargeStatus {
  POSTED
  VOIDED     // only through an approved CHARGE_VOID request (§8)
}
```

- **Billing happens at the point of use; settlement happens at Accounts.** A charge posts the
  moment the service is incurred: registration when the patient is registered, a drug when the
  prescription is placed, a test when it's ordered. Paying is a separate event, at the cashier,
  never at the lab, pharmacy or front desk.
- **Every billable event posts a `Charge` (D7)**: self-pay, insured, staff and waived alike. A
  waiver is not "don't post the charge". The charge is posted and then written off through §8, so
  it stays on record.
- **`billingAccountId` is a snapshot.** If a child later moves off the family account, their past
  charges stay where the money actually came from.
- **Coverage is chosen per visit.** When the `Appointment` is opened (`07`), reception confirms
  the coverage: by default the patient's active coverage with the lowest `priority`, or self-pay
  if the patient asks. Charges in that visit inherit it. A cashier may override it on one charge
  (for example, the patient pays cash for one drug), and the override is audited. `07`'s
  `Appointment` gains a `coverageId`.
- **One coverage per charge in v1.** Splitting one charge across two payers is out of scope (§15).

## 6. Allocation: who owes which part

### 6.1 `ChargeAllocation`

```prisma
model ChargeAllocation {
  id                String            @id @default(uuid())
  chargeId          String
  responsibleType   ResponsibleType
  billingAccountId  String?                   // PAYER and ACCOUNT: the ledger it's billed to
  coverageId        String?                   // PAYER only
  basis             AllocationBasis           // why this party owes it
  amount            Decimal
  state             AllocationState   @default(ACTIVE)
  replacesId        String?                   // the allocation this one superseded
  requestId         String?                   // approved FinancialRequest, when one created it

  // payer review (PAYER only)
  reviewStatus      ReviewStatus?
  authorizationCode String?
  reviewedAt        DateTime?
  reviewedBy        String?
  rejectionReason   String?

  // payment
  paidAmount        Decimal           @default(0)
  paymentStatus     PaymentStatus

  createdAt         DateTime          @default(now())
  createdBy         String

  charge            Charge            @relation(fields: [chargeId], references: [id])

  @@index([chargeId, state])
  @@index([billingAccountId, paymentStatus, state])
  @@index([coverageId, reviewStatus])
}

enum ResponsibleType {
  PAYER      // a payer's account owes it
  ACCOUNT    // the patient's billing account owes it
  HOSPITAL   // forgiven through an approved write-off; only created by §8
}

enum AllocationBasis {
  COVERED            // payer's covered share
  COPAY              // patient's copay share
  OVER_LIMIT         // above a cap
  NOT_COVERED        // excluded category, ineligible, or self-pay visit
  REBILLED           // moved to the patient after a payer rejection
  WRITTEN_OFF        // HOSPITAL allocation
}

enum AllocationState {
  ACTIVE
  SUPERSEDED   // replaced by one or more newer allocations (replacesId points here)
  VOIDED       // its charge was voided through an approved request
}

enum ReviewStatus {
  PENDING_AUTH    // waiting for pre-authorisation or over-limit approval
  PENDING_REVIEW  // claimable / on statement, awaiting payer decision
  APPROVED
  REJECTED        // payer refused; owner must be resolved (§7.4)
}

enum PaymentStatus {
  UNPAID
  PART_PAID
  PAID
  NOT_APPLICABLE  // HOSPITAL allocations
}
```

**Invariant (D7):** for every `POSTED` charge, the `ACTIVE` allocations add up to exactly
`Charge.amount`. Allocations are never edited or deleted. A change of owner marks the old
allocation `SUPERSEDED` and creates new ones carrying `replacesId`. A nightly integrity job checks
the invariant and raises an alert on any charge that breaks it.

### 6.2 Allocation at posting

For a charge with a `coverageId`, inside one transaction:

1. **Eligibility.** Coverage, policy, plan and payer are `ACTIVE`, and the charge date falls inside
   the validity windows. If not, the whole charge is `ACCOUNT / NOT_COVERED`, and the cashier sees
   the reason.
2. **Category.** If the `PlanBenefit` says `covered = false`, the whole charge is
   `ACCOUNT / NOT_COVERED`.
3. **Copay.** `copay = amount × (benefit.copayPercent ?? plan.copayPercent) / 100`.
   `requested = amount − copay`.
4. **Caps.** Lock the `BenefitUsage` rows (§6.4). `headroom = min(member remaining, policy
   remaining, category remaining)`. `covered = min(requested, headroom)`.
   `excess = requested − covered`.
5. **Excess.** With `BILL_TO_ACCOUNT`, it becomes `ACCOUNT / OVER_LIMIT`. With
   `REQUIRE_APPROVAL`, it becomes a separate `PAYER / OVER_LIMIT` allocation in `PENDING_AUTH`.
6. **Write allocations.**
   - `PAYER / COVERED`: `PENDING_AUTH` if the benefit requires pre-auth and no code has been
     captured; `PENDING_REVIEW` for `CLAIMS` payers; `APPROVED` for `DIRECT_INVOICE` and
     `INTERNAL` payers.
   - `ACCOUNT / COPAY` and `ACCOUNT / OVER_LIMIT` as applicable.
   - Zero-amount allocations aren't written.
7. **Post to ledgers.** Each `PAYER` or `ACCOUNT` allocation posts a `CHARGE` entry to its
   account. `PAYER` allocations in `PENDING_AUTH` post nothing until they're authorised.
8. **Apply credit.** If the account has `unappliedCredit`, apply it to the new allocations (§7.1).
9. **Usage.** Add the covered amount to the locked `BenefitUsage` counters.

A charge with no `coverageId` gets a single `ACCOUNT / NOT_COVERED` allocation, followed by
steps 7 and 8.

### 6.3 Pre-authorisation and over-limit approval

`PENDING_AUTH` allocations appear in the **Insurance queue** (§9.2). An insurance officer records
the payer's authorisation code: the allocation moves to `PENDING_REVIEW`/`APPROVED`, its `CHARGE`
entry posts, and usage is counted. If the payer refuses authorisation, it's handled as a
rejection (§7.4), before the service is delivered wherever possible, so the patient can decide
whether to pay themselves.

### 6.4 `BenefitUsage` (cap counters)

```prisma
model BenefitUsage {
  id          String           @id @default(uuid())
  scope       UsageScope
  scopeId     String                       // coverageId (MEMBER) or policyId (POLICY)
  category    ServiceCategory?             // null = overall annual limit
  periodStart DateTime
  periodEnd   DateTime
  usedAmount  Decimal          @default(0)

  @@unique([scope, scopeId, category, periodStart])
}

enum UsageScope {
  MEMBER
  POLICY
}
```

Usage is kept in counters rather than summed from allocations each time. Two charges posting at
once would otherwise both see the same headroom and together break the cap, and locking the
counter row serialises them. A rejection or void subtracts its amount back. A nightly job
recomputes the counters from allocations and alerts on any drift.

### 6.5 Account statement

Because each `ACCOUNT` allocation carries the charge's `patientId`, a family statement shows one
shared balance and each member's share of it. A payer statement lists `PAYER` allocations by
patient, member number and visit.

### 6.6 Insufficient funds and the service gate

The charge **always posts** (D7). If the account's outstanding amount (unpaid `ACCOUNT`
allocations) exceeds its `creditLimit`, the unpaid allocations put the patient into the
**Cashier queue** (§9.1). Whether the service waits for payment is a rule of the module that
raised the charge: pharmacy dispenses only after payment, while emergency care proceeds
regardless. Billing records the debt. It doesn't decide clinical access.

## 7. Reconciliation: payments in, bills marked paid

### 7.1 `PaymentApplication`

Matches an incoming credit (a deposit or remittance) to the allocations it pays.

```prisma
model PaymentApplication {
  id            String    @id @default(uuid())
  creditEntryId String                       // DEPOSIT or REMITTANCE AccountEntry
  allocationId  String
  amount        Decimal
  appliedAt     DateTime  @default(now())
  appliedBy     String
  reversedAt    DateTime?
  reversedBy    String?

  @@index([allocationId])
  @@index([creditEntryId])
}
```

Each application updates the allocation's `paidAmount` and `paymentStatus` and reduces the
account's `unappliedCredit`. A credit can be split across several allocations, and an allocation
can be paid by several credits.

**How a credit is applied:**
- **Targeted.** The cashier ticks the specific items the patient is paying for, or a payer's
  itemised payment advice lists the lines it pays. Those allocations are paid first.
- **Oldest first.** Any remainder, or an untargeted deposit, pays the account's unpaid
  allocations oldest first, across all members of a family account.
- **Unapplied.** Whatever is left stays as `unappliedCredit` (a prepaid deposit) and is applied
  automatically when the next charge posts (§6.2 step 8).

### 7.2 Family side

A deposit is an `AccountEntry(DEPOSIT)` and is applied as above. The cashier can see, for any
member, which bills are paid, part-paid or unpaid.

### 7.3 Payer side

1. `PAYER` allocations accumulate on the payer's account as `CHARGE` entries (§6.2).
2. Claim batches (`CLAIMS`) or statements (`DIRECT_INVOICE`) are generated from those allocations
   (document formats are out of scope, §15).
3. **The payer's decisions are recorded per line** (`CLAIMS` mode): `APPROVED`, or `REJECTED` with
   a reason (§7.4).
4. **The payer's payment is a `REMITTANCE`** entry on the payer's account, applied line by line
   from the payment advice where one is given, otherwise oldest first.
5. **A short payment is not a write-off (D9).** If ₦13,500 arrives against ₦14,000, the remaining
   ₦500 stays `PART_PAID`/`UNPAID`, the payer's balance stays negative, and the line stays in the
   Insurance queue as outstanding. It only stops being the payer's debt if the payer formally
   rejects it (§7.4) or a write-off is approved (§8).

### 7.4 Rejections

When a payer rejects a line (whole or partial):

1. A partial rejection splits the allocation into an approved part and a rejected part (the
   original is `SUPERSEDED`).
2. The rejected allocation becomes `REJECTED`. A `REVERSAL` entry takes its unpaid amount off the
   payer's account, and `BenefitUsage` is reduced.
3. The `REJECTED` allocation **stays `ACTIVE`**. The money now has no one paying it, and it sits
   visibly in the Insurance queue until an insurance officer resolves it. There are two outcomes:
   - **Rebill to patient:** for rejections like "not eligible" or "service not covered". The
     rejected allocation is superseded by an `ACCOUNT / REBILLED` allocation on the charge's
     snapshot account, and a `CHARGE` entry is posted. This needs the
     `insurance.rejection.resolve` permission and a recorded reason, but no approval, because no
     money is forgiven: the patient still owes it and can dispute it, which would go through §8.
   - **Write off:** for rejections that are the hospital's fault (missing pre-auth, coding error)
     or a tariff dispute the hospital accepts. A `WRITE_OFF` request is raised (§8), and the
     allocation stays `REJECTED` until that request is approved or rejected.
4. The rejection reason code **suggests** an outcome, but a person always chooses it.

## 8. Financial Requests: write-offs and other controlled money movements

Every action that forgives money or moves it out of the normal charge-and-pay flow goes through a
`FinancialRequest`. Nothing happens to the money until the request is approved. Approval runs the
money movement in the same transaction, so "approved" and "done" can never disagree.

### 8.1 Request types

| Type | What it does when approved | Typical requester |
|---|---|---|
| `WRITE_OFF` | Supersedes the target allocations with `HOSPITAL / WRITTEN_OFF` allocations and posts `WRITE_OFF` credit entries to the owing account | Insurance officer, billing supervisor |
| `REFUND` | Posts a `REFUND` debit; money leaves the hospital | Cashier |
| `ADJUSTMENT` | Posts an `ADJUSTMENT` entry (correcting a ledger error) | Billing supervisor |
| `CHARGE_VOID` | Voids a charge: allocations `VOIDED`, entries reversed, usage reduced, applied payments returned to unapplied credit | Cashier, posting department |
| `TRANSFER` | Moves balance between two accounts (paired entries) | Cashier |
| `CREDIT_LIMIT_CHANGE` | Updates `BillingAccount.creditLimit` | Billing supervisor |
| `RECOVERY` | Reverses a write-off when the money is later collected: the `HOSPITAL` allocation is superseded by an `ACCOUNT` allocation | Billing supervisor |

Deposits, remittances, normal charge posting and rebilling a rejection don't need a request.
Each is either backed by money actually received, by a service actually delivered, or forgives
nothing.

### 8.2 Model

```prisma
model FinancialRequest {
  id                String                 @id @default(uuid())
  organizationId    String
  branchId          String
  requestType       FinancialRequestType
  amount            Decimal
  reasonCode        FinancialReason
  narrative         String                          // required, min 20 chars — the full explanation
  billingAccountId  String?
  chargeId          String?
  payload           Json?                           // type-specific: transfer target, new credit limit, ...
  requiredApprovals Int                             // 1 or 2, fixed at submission (§8.4)
  status            FinancialRequestStatus @default(PENDING)
  requestedBy       String
  requestedAt       DateTime               @default(now())
  decidedAt         DateTime?
  cancelledBy       String?
  cancelledAt       DateTime?

  targets           FinancialRequestTarget[]
  approvals         FinancialRequestApproval[]
  attachments       FinancialRequestAttachment[]

  @@index([organizationId, status, requestType])
  @@index([requestedBy])
}

model FinancialRequestTarget {
  id           String  @id @default(uuid())
  requestId    String
  allocationId String
  amount       Decimal                  // part of the allocation this request covers

  request      FinancialRequest @relation(fields: [requestId], references: [id])
}

model FinancialRequestApproval {
  id               String           @id @default(uuid())
  requestId        String
  approverId       String
  decision         ApprovalDecision
  note             String                    // required
  approverLimit    Decimal                   // the approver's limit at decision time, for audit
  decidedAt        DateTime         @default(now())

  request          FinancialRequest @relation(fields: [requestId], references: [id])
  @@unique([requestId, approverId])
}

model FinancialRequestAttachment {
  id          String   @id @default(uuid())
  requestId   String
  fileRef     String                       // stored file location
  fileName    String
  mimeType    String
  sha256      String                       // tamper evidence
  description String?                      // "Acme remittance advice Sept 2026"
  uploadedBy  String
  uploadedAt  DateTime @default(now())

  request     FinancialRequest @relation(fields: [requestId], references: [id])
}

enum FinancialRequestType {
  WRITE_OFF
  REFUND
  ADJUSTMENT
  CHARGE_VOID
  TRANSFER
  CREDIT_LIMIT_CHANGE
  RECOVERY
}

enum FinancialRequestStatus {
  PENDING
  APPROVED     // and executed
  REJECTED
  CANCELLED    // withdrawn by requester before any decision
}

enum ApprovalDecision {
  APPROVE
  REJECT
}

enum FinancialReason {
  PAYER_REJECTION_HOSPITAL_FAULT
  PAYER_TARIFF_DISPUTE
  MISSING_PREAUTH
  WAIVER_CLINICAL           // authorised by medical director
  WAIVER_WELFARE            // indigent / social welfare
  STAFF_BENEFIT
  BAD_DEBT
  DECEASED_NO_ESTATE
  CHARGE_ERROR
  DUPLICATE_PAYMENT
  OVERPAYMENT
  SERVICE_NOT_RENDERED
  DEBT_RECOVERED
  OTHER
}
```

### 8.3 Evidence required per reason

The system won't accept a submission without an attachment where marked. `OTHER` always needs one.

| Reason | Attachment required | Expected evidence |
|---|---|---|
| `PAYER_REJECTION_HOSPITAL_FAULT`, `PAYER_TARIFF_DISPUTE`, `MISSING_PREAUTH` | Yes | Payer's rejection notice / remittance advice |
| `WAIVER_CLINICAL` | Yes | Signed waiver memo from the medical director |
| `WAIVER_WELFARE` | Yes | Social-welfare assessment |
| `STAFF_BENEFIT` | No | Generated batch listing (§8.6) |
| `BAD_DEBT` | Yes | Record of collection attempts |
| `DECEASED_NO_ESTATE` | Yes | Death record / estate confirmation |
| `CHARGE_ERROR`, `SERVICE_NOT_RENDERED` | No | Narrative must name the source order |
| `DUPLICATE_PAYMENT`, `OVERPAYMENT` | Yes | Both payment references / slips |
| `DEBT_RECOVERED` | Yes | Proof of the payment received |
| `OTHER` | Yes | — |

### 8.4 Approval rules

1. **The requester never approves their own request.** This is enforced by the system.
2. **Approval limits.** An approver must hold `finance.request.approve` and have an
   `ApprovalLimit` for that request type that is at least the request amount. A staffer's limit is
   the highest across their duty profiles. With no `ApprovalLimit` row for a type, they can't
   approve that type at all.
3. **Dual approval.** If the amount is above the organization's `dualApprovalAbove` for that type,
   two different approvers are required (neither of them the requester). `requiredApprovals` is
   fixed when the request is submitted, so later configuration changes can't loosen an open
   request.
4. **Any rejection ends the request.** One `REJECT` is final. The requester can raise a new
   request with more evidence, and the rejected one stays on record.
5. **Approved requests run atomically and are permanent.** An approved write-off is only ever
   undone by a new `RECOVERY` request.
6. **No edits after submission.** A request with a mistake is cancelled (only possible while no
   decision has been recorded) and raised again.

```prisma
model ApprovalLimit {
  id            String               @id @default(uuid())
  dutyProfileId String
  requestType   FinancialRequestType
  maxAmount     Decimal

  dutyProfile   DutyProfile          @relation(fields: [dutyProfileId], references: [id], onDelete: Cascade)
  @@unique([dutyProfileId, requestType])
}

model ApprovalPolicy {
  id                String               @id @default(uuid())
  organizationId    String
  requestType       FinancialRequestType
  dualApprovalAbove Decimal?                       // null = single approval always

  @@unique([organizationId, requestType])
}
```

Changing `ApprovalLimit` or `ApprovalPolicy` needs `finance.policy.manage` and is audit-logged.
The person who changes approval limits shouldn't also be a routine approver, but that's flagged in
the write-off register report (§8.5) rather than enforced.

### 8.5 Write-off register

A read-only report over approved `WRITE_OFF` and `RECOVERY` requests: period, reason, amount,
patient, payer, requester, approvers, attachments. It totals by reason, by requester and by
approver. Finance reviews it every month, so frequent or large write-offs by one requester or
one approver show up. Also covered: refunds, adjustments and voids (`finance.report.view`).

### 8.6 Staff benefit (INTERNAL payers)

Staff cover is billed as a payer, so caps, copay and usage work the same as for any plan. At
period close the system **drafts** one `WRITE_OFF` request (`STAFF_BENEFIT`) targeting that
period's approved, unpaid `INTERNAL` allocations, with the listing attached. It goes through §8.4
like any other request. Until it's approved, those amounts remain owed on the staff payer's
account.

## 9. Queues

The Accounts department (`04` §3) currently seeds a single default "Accounts Queue". This PRD
replaces it with three queues. `01-application-flow.md` distinguishes two kinds of queue:
patient-facing queues, where a person is waiting, and object worklists, where nobody is waiting.

| systemKey | Name | Kind | Who works it |
|---|---|---|---|
| `CASHIER_QUEUE` | Cashier | Patient-facing | Cashiers |
| `INSURANCE_QUEUE` | Insurance / HMO Desk | Mixed (pre-auth is patient-facing, claims are object worklist) | Insurance officers |
| `WRITE_OFF_QUEUE` | Write-offs & Approvals | Object worklist | Approvers (supervisors, finance) |

All three are seeded for every business type that enables Accounts (Hospital, Laboratory and
Pharmacy, per `04` §3). Items are derived from allocation and request state, not stored as
separate rows, so a queue can never disagree with the money it shows.

### 9.1 Cashier queue

- **Enters:** a patient's account has unpaid `ACCOUNT` allocations over its `creditLimit`, or a
  module's payment gate (§6.6) is waiting on payment.
- **Shows:** patient, account (with family members' unpaid items), each unpaid allocation with its
  basis (copay, over limit, not covered, rebilled), and unapplied credit.
- **Actions:** take a deposit (targeted or oldest-first), print a receipt, request a refund, void
  or transfer (§8).
- **Leaves:** when outstanding is back within `creditLimit` and no gate is waiting.

### 9.2 Insurance queue

Tabs:
1. **Pre-auth pending:** `PENDING_AUTH` allocations. The patient is usually waiting, so this tab
   is sorted first.
2. **Eligibility problems:** visits where the selected coverage failed eligibility (§6.2 step 1).
3. **Awaiting payer decision:** `PENDING_REVIEW` allocations, grouped by payer, ready to batch.
4. **Rejected, unresolved:** `REJECTED` allocations that need rebilling or a write-off request.
5. **Outstanding:** approved but unpaid or part-paid payer allocations, with age.
6. **Remittances:** payer payments received with unapplied credit left to match.

### 9.3 Write-offs & Approvals queue

- **Shows:** `PENDING` financial requests the viewer is allowed to approve: holds
  `finance.request.approve`, the request type's limit is at least the amount, the viewer isn't the
  requester, and hasn't already approved.
- **Actions:** open the request with its targets, narrative and attachments. Approve or reject,
  with a required note.
- Requesters see their own requests and statuses here, read-only.

## 10. Permissions

Added to `src/access-control/permissions.catalog.ts`. Following `05`, a permission applies within
the duty profile's queues. Approval and policy permissions are normally granted on profiles with
no queue restriction.

| Key | Name | Grants |
|---|---|---|
| `billing.view` | View Billing | Charges, allocations, account statements *(exists)* |
| `billing.charge.create` | Post Manual Charge | Post a charge not raised by another module *(replaces `billing.create`)* |
| `billing.payment.receive` | Receive Payment | Record deposits, apply payments, issue receipts |
| `billing.account.create` | Create Billing Account | Open a family account (reception) |
| `billing.account.member.add` | Add Account Member | Put a patient on a family account, including at registration (reception) |
| `billing.account.member.remove` | Remove Account Member | Take a patient off a family account (Accounts) |
| `billing.account.update` | Update Billing Account | Edit name and holder details (Accounts) |
| `billing.refund.request` | Request Refund | Raise `REFUND` requests |
| `billing.void.request` | Request Charge Void | Raise `CHARGE_VOID` requests |
| `billing.transfer.request` | Request Transfer | Raise `TRANSFER` requests |
| `billing.adjustment.request` | Request Adjustment | Raise `ADJUSTMENT` requests |
| `billing.credit_limit.request` | Request Credit Limit Change | Raise `CREDIT_LIMIT_CHANGE` requests |
| `billing.writeoff.request` | Request Write-off | Raise `WRITE_OFF` and `RECOVERY` requests |
| `coverage.view` | View Coverage | See a patient's coverages and remaining benefit |
| `coverage.select` | Select Coverage | Choose a visit's coverage, set coverage priority (reception) |
| `coverage.enrol` | Enrol Coverage | Enrol principals and add dependants (insurance desk) |
| `coverage.end` | End Coverage | End a coverage; ending a principal ends the policy (insurance desk) |
| `payer.manage` | Manage Payers & Plans | Payers, plans, benefits, copay, caps |
| `insurance.preauth.record` | Record Pre-authorisation | Capture auth codes, record auth refusal |
| `insurance.claim.review` | Record Payer Decisions | Record approve/reject per line |
| `insurance.remittance.record` | Record Remittance | Post payer remittances, match lines |
| `insurance.rejection.resolve` | Resolve Rejections | Rebill a rejected line to the patient |
| `finance.request.approve` | Approve Financial Requests | Approve/reject within `ApprovalLimit` |
| `finance.policy.manage` | Manage Approval Policy | Edit `ApprovalLimit` / `ApprovalPolicy` |
| `finance.report.view` | View Finance Reports | Write-off register, refund/adjustment/void reports, payer ageing |

**Where permissions are checked.** The access token signed at login carries the caller's
`organizationId`, permission keys and duty profile ids, so no request reads permissions from the
database. When anyone's permissions change, including approval rights, they are forced to log in
again through the re-login flag (`09` §9.3). An approver whose rights were removed can't keep
approving on an old token.

`billing.approve` ("Approve and process payments") is **removed**. Combining "receive payments"
with "approve" in one key is exactly what the separation of duties in §8 forbids. Its holders are
migrated to `billing.payment.receive`, and approval is granted separately.

**Suggested duty profiles** (seeded for the Accounts department and editable by the tenant; none
is assigned automatically):

| Profile | Queues | Permissions | Approval limits |
|---|---|---|---|
| Cashier | Cashier | `billing.view`, `billing.payment.receive`, `billing.account.*`, `billing.refund.request`, `billing.void.request`, `billing.transfer.request`, `coverage.view` | — |
| Insurance Officer | Insurance | `billing.view`, `coverage.*`, `insurance.*`, `billing.writeoff.request` | — |
| Billing Supervisor | Cashier, Insurance, Write-offs & Approvals | above + `billing.charge.create`, `billing.adjustment.request`, `billing.credit_limit.request`, `finance.request.approve`, `finance.report.view` | set by tenant at onboarding (e.g. ₦50,000) |
| Finance Manager | Write-offs & Approvals | `billing.view`, `payer.manage`, `finance.request.approve`, `finance.policy.manage`, `finance.report.view` | set by tenant at onboarding (higher tier) |

Reception keeps `billing.view` and gains `coverage.view`, `coverage.select` (to choose a visit's
coverage), `billing.account.create` and `billing.account.member.add` (to open a family account
and attach a patient to it at registration). Removing members and editing accounts stay with
Accounts. The seeded Hospital Administrator profile drops `billing.approve` and gains
`finance.report.view`. Who approves money is a decision the tenant makes explicitly, not
something the administrator role gets by default.

## 11. Changes to Existing Models and Code

| Current | Becomes |
|---|---|
| `User.balance` | Removed; `BillingAccount.balance` |
| `Transaction` (its relation is also wrong: `fields: [id]` should have been `[userId]`) | `AccountEntry` |
| `TransactionMode` | `PaymentMode`; `SYSTEM_DEBIT` replaced by `entryType = CHARGE` |
| `InsuranceScheme` | `Payer` + `Plan`; its `registrationFee` becomes a `REGISTRATION` `PlanBenefit` |
| `NHISWorker` → scheme | → `Payer` |
| `Patient.billingtype`, `BillingType` enum, `Patient.insuranceSchemeId` | Removed; `Coverage` |
| `06` §2.6 `PatientAccount` | `BillingAccount` (`ORGANIZATION` type dropped; employers are `CORPORATE` payers) |
| `07` `Appointment` | Gains `coverageId` (§5) |
| `departments.catalog.ts` Accounts default queue | The three queues of §9 |
| `permissions.catalog.ts` `billing.create` / `billing.approve` | §10 |

**Registration (`src/patients`):**
- `CreatePatientDto` drops `billingType` and `insuranceSchemeId` and gains an optional
  `billingAccountId` (join a family). Without it, an `INDIVIDUAL` account is created in the same
  transaction as the patient.
- **The registration and card fees are billed at registration**, in the same transaction, as
  `REGISTRATION` charges against the account the patient lands on (fees set to 0 aren't billed).
  Credit already on the account pays them immediately; otherwise they're owed. The response
  includes the outstanding amount.
- **Reception never takes money.** The old registration-payment step is removed. The patient
  settles at Accounts (`POST /billing-accounts/:id/deposits`, §7.2), now or later.
- The patient's branch and the cashier's branch both come from the staff member's token, never
  the request.
- Coverage is enrolled as a separate step, because it often needs the payer's card or list.

**Newborns (`06` §4):** added to the mother's `BillingAccount`, with a `CHILD` coverage on her
policy offered subject to §4.4.

## 12. Worked Example

The Okafor family account is funded with a ₦20,000 deposit. Chidi (principal) and his son Obi
are on Acme Corp's staff plan, which is `DIRECT_INVOICE` with 10% copay and ₦5,000 remaining on
Obi's pharmacy cap. Chidi's wife Ada has no coverage.

| Event | Allocations | Acme account | Okafor account |
|---|---|---|---|
| Deposit ₦20,000 | — | 0 | +20,000 (unapplied 20,000) |
| Chidi consult ₦10,000 | PAYER/COVERED 9,000 · ACCOUNT/COPAY 1,000 (paid from credit) | −9,000 | 19,000 |
| Obi drugs ₦12,000: copay 1,200; requested 10,800; cap 5,000 | PAYER/COVERED 5,000 · ACCOUNT/COPAY 1,200 · ACCOUNT/OVER_LIMIT 5,800 (paid from credit) | −14,000 | 12,000 |
| Ada lab ₦15,000 | ACCOUNT/NOT_COVERED 15,000: 12,000 paid from credit, 3,000 unpaid → Cashier queue | −14,000 | −3,000 |
| Ada pays ₦3,000 at cashier, targeted | Ada's lab allocation → PAID | −14,000 | 0 |
| Acme statement ₦14,000; remits ₦13,500 | Chidi 9,000 PAID · Obi 4,500 of 5,000 → PART_PAID | **−500 still owed** | 0 |
| Acme formally disputes Obi's ₦500 as above agreed tariff | Obi's line split: 4,500 APPROVED/PAID + 500 REJECTED; reversal on Acme account | 0 | 0 |
| Insurance officer raises `WRITE_OFF` ₦500, `PAYER_TARIFF_DISPUTE`, attaches Acme's dispute letter | No change until approved; the ₦500 sits in the Insurance queue as rejected and unresolved | 0 | 0 |
| Billing supervisor approves (₦500 within their limit; not the requester) | REJECTED 500 superseded by HOSPITAL/WRITTEN_OFF 500; appears in the write-off register | 0 | 0 |

Every charge in this example ends with active allocations equal to its amount, and every naira
can be traced to its source: what Acme paid, what the family paid, and what the hospital forgave,
with the approver's name and the evidence attached.

## 13. APIs

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/api/v1/billing-accounts` | POST / GET | `billing.account.create` / `billing.view` | Create family account / search |
| `/api/v1/billing-accounts/:id` | GET / PATCH | `billing.view` / `billing.account.update` | Detail, holder, status (not `creditLimit`) |
| `/api/v1/billing-accounts/:id/members` | POST / DELETE | `billing.account.member.add` / `.member.remove` | Move patients in/out |
| `/api/v1/billing-accounts/:id/deposits` | POST | `billing.payment.receive` | Deposit, optional target allocations |
| `/api/v1/billing-accounts/:id/statement` | GET | `billing.view` | Entries, allocations, paid status, per member |
| `/api/v1/patients/:id/billing-account` | GET | `billing.view` | Current account, balance, unpaid items |
| `/api/v1/payers` | POST / GET / PATCH | `payer.manage` | Payers (creates the payer account) |
| `/api/v1/payers/:id/plans` | POST / GET / PATCH | `payer.manage` | Plans and `PlanBenefit` rows |
| `/api/v1/plans/:id/policies` | POST | `coverage.enrol` | Enrol principal |
| `/api/v1/policies/:id/coverages` | POST | `coverage.enrol` | Add dependant |
| `/api/v1/coverages/:id` | DELETE | `coverage.end` | End coverage |
| `/api/v1/patients/:id/coverages/priority` | PUT | `coverage.select` | Order a patient's coverages |
| `/api/v1/patients/:id/coverages` | GET | `coverage.view` | Coverages with remaining benefit |
| `/api/v1/charges` | POST | internal / `billing.charge.create` | Post a charge; returns allocations |
| `/api/v1/charges/:id` | GET | `billing.view` | Charge with allocation history |
| `/api/v1/allocations/:id/authorize` | POST | `insurance.preauth.record` | Record auth code or refusal |
| `/api/v1/allocations/:id/decision` | POST | `insurance.claim.review` | Payer approve/reject (whole or partial) |
| `/api/v1/allocations/:id/rebill` | POST | `insurance.rejection.resolve` | Rebill a rejected line to the patient |
| `/api/v1/payers/:id/remittances` | POST / GET | `insurance.remittance.record` | Post remittance with line matches |
| `/api/v1/financial-requests` | POST / GET | `billing.*.request` / any | Raise / list requests |
| `/api/v1/financial-requests/:id` | GET | requester or eligible approver | Detail with attachments |
| `/api/v1/financial-requests/:id/attachments` | POST | requester (while `PENDING`) | Upload evidence |
| `/api/v1/financial-requests/:id/decision` | POST | `finance.request.approve` | Approve/reject with note |
| `/api/v1/financial-requests/:id/cancel` | POST | requester | Withdraw before any decision |
| `/api/v1/finance/approval-limits` | GET / PUT | `finance.policy.manage` | `ApprovalLimit` / `ApprovalPolicy` |
| `/api/v1/finance/reports/write-offs` | GET | `finance.report.view` | Write-off register |
| `/api/v1/queues/cashier`, `/insurance`, `/approvals` | GET | queue membership (`05`) | §9 worklists |

## 14. Why / Where / Why Not

- **Why a corporate employer is a `Payer`, not an account type.** Per-member caps, family caps,
  dependant rules, copay and exclusions are identical to HMO cover. Only how the money is
  collected differs, and `settlementMode` covers that.
- **Why `BillingAccount` survives.** A family pooling cash has no sponsor, no caps and nothing to
  claim. Making it a "plan" would invent a fake payer for every household.
- **Why payers get a ledger like families (D8).** One mechanism for balances, statements, ageing
  and credit limits, instead of two that drift apart.
- **Why per-line matching on top of the payer balance (D10).** HMOs and NHIS approve, reject and
  pay line by line. With only a running balance, a shortfall can't be traced to a claim, so it
  can't be resubmitted or disputed.
- **Why rejected lines stay `ACTIVE` until resolved.** The money must never vanish between "the
  payer won't pay" and "someone decided who will". Keeping the rejected line active keeps it
  counted and visible in the Insurance queue.
- **Why every money movement outside charge-and-pay needs a request (D11/D12).** Write-offs,
  refunds, voids and adjustments are where money goes missing in hospital billing. Requiring a
  second person, a reason, evidence and an approval limit, plus a database constraint against
  bypassing it, makes each one traceable to the people who approved it.
- **Why approval executes the movement.** A separate "approved" step followed by a manual
  "posted" step leaves room for approved-but-never-posted money, or posted-but-never-approved
  money.
- **Why queues are derived, not stored.** A stored queue row can fall out of step with the
  allocation it represents. Deriving the queue from state means what the cashier sees is what's
  owed.
- **Why not a general ledger.** Accounting belongs in the hospital's accounting system. This model
  keeps enough detail to export to one later.

## 15. Explicitly Out of Scope for v1

- **Price catalog and payer-specific tariffs** (`PlanTariff`), to be designed with the price-catalog
  PRD.
- **Claim batch and statement documents**, including NHIA e-claims formats. They consume `PAYER`
  allocations.
- **Coordination of benefits** (one charge split across two payers).
- **Item-level exclusions** (specific drugs or procedures), which depend on the catalog.
- **Accounting export / GL integration.**
- **Online payment gateway.** `PaymentMode.ONLINE` exists so such payments can be recorded, but
  core billing must work offline.
- **Attachment storage backend.** `fileRef` points to whatever file storage the deployment
  provides. It has to work on a self-hosted, offline install, so it can't depend on a cloud-only
  service.

## 16. Open Decisions

- **Insufficient funds at the desk.** §6.6/§7.1 assume a charge always posts, the unpaid amount
  sends the patient to the Cashier queue, and the cashier can take payment for specific items or
  let it pay oldest first. Confirm this matches how cashier desks actually work.
- **Same-shift voids.** §8 requires approval for every void, including a cashier fixing their own
  mistake minutes later. If that proves too heavy, the option is a low `CHARGE_VOID` limit for
  supervisors on shift, not removing approval.
