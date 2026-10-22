# Feature PRD — Organization Onboarding (Hospital / Lab / Pharmacy)

Status: Draft · Last updated: 2026-07-05
Depends on: `docs/01-application-flow.md` (§1 Tenant Types, §3.1/§4/§5 Onboarding)
Companion docs: `03-federation-patient-sharing.md` (optional cross-org module),
`01-cloud-directory-service.md` (separate repo, franchise-membership registry)

Naming note: the organization entity is called `Hospital` throughout this PRD set — read it as
"the organization row," whether the business is actually a hospital, a standalone lab, or a
standalone pharmacy.

## 1. Org Types

An organization is classified on two independent axes — what kind of business it runs, and how
many locations it has. Both live on the `Hospital` row. Neither says anything about whether this
org talks to any other org — that's `03`'s concern entirely, opt-in and orthogonal.

| Axis | Values | Determines |
|---|---|---|
| `businessType` | `HOSPITAL`, `LABORATORY`, `PHARMACY` | Which departments/modules are active (§1 of the application-flow doc) |
| `orgType` | `STANDALONE`, `CHAIN` | Whether this org has one branch or several |

| `orgType` | Branches | Data visibility |
|---|---|---|
| `STANDALONE` | Exactly one (auto-created, see §2.2) | Everything in one place |
| `CHAIN` | Two or more | Patients, staff, inventory, and beds all scoped to the branch they belong to (§2.2); billing/insurance scoping is TBD, deferred to the Billing PRD |

Every org — standalone or chain — is a single, independent deployment with its own database.
There is no vendor-hosted multi-tenancy anywhere in this document: the product is handed to the
customer, who owns and runs it. This is unrelated to whether a deployment later chooses to enable
the optional Federation module in `03`.

Optionally, an org can record that it belongs to a **Healthcare Network** — a brand/group label
like "Reddington Hospitals" or "Evercare." This is two plain fields on `Hospital`
(`healthcareNetworkId String?`, `healthcareNetworkName String?`) and nothing more here — there is
no shared `HealthcareNetwork` table anywhere, because there's no shared database for it to live
in. This is the label an org registers under the Cloud Directory's `Franchise` concept (`01`) if
it opts in to that service — but it's still just a plain local field here, still unenforced, since
there's no shared DB for it to be validated against. Setting it does nothing on its own; it only
becomes meaningful once `03` (Federation) is enabled and, optionally, once the org actually
registers a franchise with the Cloud Directory. A hospital, a diagnostics center, and a pharmacy
under one brand (e.g. Evercare) are three separate `Organization` rows on three separate installs,
each optionally carrying the same `healthcareNetworkName` — never branches of one `Hospital` row.

## 2. Data Model

### 2.1 `Hospital`

| Field | Type | Constraints | Why |
|---|---|---|---|
| `name`, `address`, `logo`, `phone`, `email`, `city`, `state`, `country`, `zipCode`, `website`, `slogan`, `pobox`, `nfcCardFee`, `registrationFee`, `paymentPlan` | — | — | Organization profile and billing defaults |
| `businessType` | `BusinessType` enum | required, default `HOSPITAL` | Drives which departments are active per `01-application-flow.md` §1 |
| `orgType` | `OrgType` enum | required, default `STANDALONE` | Drives branch behavior below |
| `healthcareNetworkId` | `String?` | optional, no FK (see §1) | Local-only label, meaningful only to `03` |
| `healthcareNetworkName` | `String?` | optional | Human-readable network name, shown in UI |

Relations: `branches Branch[]`, `staff Staff[]`, `patients Patient[]`.

```prisma
enum BusinessType {
  HOSPITAL
  LABORATORY
  PHARMACY
}

enum OrgType {
  STANDALONE
  CHAIN
}
```

### 2.2 `Branch`

```prisma
model Branch {
  id           String       @id @default(uuid())
  name         String
  code         String       @unique             // short, human-assigned — e.g. "MAIN", "DWTN"
  address      String
  city         String
  state        String
  country      String
  phone        String[]
  email        String?
  isMainBranch Boolean      @default(false)      // exactly one across the org, enforced in service layer
  status       BranchStatus @default(ACTIVE)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  updatedBy    String?
  deletedAt    DateTime?
  deletedBy    String?

  staff        Staff[]
}

enum BranchStatus {
  ACTIVE
  INACTIVE
  CLOSED
}
```

`Staff` carries a required `branchId` FK (defaults to the org's main branch at creation time if not
specified). **`Patient` is scoped to a branch too** — a patient belongs to the branch they
registered at, and is not visible from another branch unless explicitly shared (see
`06-patient-management.md` for registration and `05-access-control-clinical-scoping.md`'s
`PatientAssignment` for the branch-sharing grant). Billing/`Transaction` scoping is TBD, deferred
to the Billing PRD. Inventory and bed/ward tables (owned by the Pharmacy and Inpatient feature
PRDs, not this one) carry `branchId` when they're modeled.

Every org gets a `Branch` row, even standalone ones — auto-created (`isMainBranch: true`) at
onboarding, so `branchId` is never nullable on `Staff` from day one, for every org type, and no
later backfill migration is ever needed.

`orgType` isn't derived from branch count: a hospital with one branch today that's already legally
structured as a chain (e.g. opening branch #2 next quarter) is a `CHAIN` from day one — a business
fact an admin sets, not something inferred from how many `Branch` rows currently exist.

### 2.3 Branch-level data isolation (Row-Level Security)

Every table carrying a `branchId` (`Staff`, `Patient`, and future branch-scoped inventory/bed
tables) has a Postgres Row-Level Security policy scoping each query to the caller's current branch
context — enforced at the database layer, not only in application-code `WHERE` clauses. A
`Patient` row is visible to a branch other than the one on its own `branchId` only when an active
branch-level `PatientAssignment` grant exists for it (`05` §6) — the RLS policy's predicate is
`branchId = current_branch() OR EXISTS (an active PatientAssignment for this patient granting
current_branch())`, not a raw bypass.

Org-wide catalog and reference tables (`Department`, `Queue`, `Role`, `Permission`, `DutyProfile`)
carry no `branchId` and are exempt from RLS entirely — they're deliberately public across every
branch in the org, per §2.2 and `04`. `Transaction`'s scoping is TBD, deferred to the Billing PRD.

## 3. Onboarding Process

Expands `01-application-flow.md` §3.1 into concrete steps and fields.

1. **Create org** — `POST /api/v1/organizations` with the `Hospital` fields from §2.1
   (`name, address, logo?, phone, email, city, state, country, zipCode, website?, slogan?, pobox?,
   nfcCardFee, registrationFee, paymentPlan?, businessType, orgType, healthcareNetworkName?`). In
   the same transaction, the server auto-creates one `Branch` row (`isMainBranch: true, code:
   "MAIN"`, address/contact copied from the org) — there is no separate "create your first branch"
   step.
2. **Add branches** (chains only) — `POST /api/v1/organizations/:id/branches` per additional
   location, any time after step 1.
3. **Invite staff** — the staff-invite flow, requiring `branchId` (defaults to the org's main
   branch if the org has only one).
4. **Seed reference data** — consultation/clinic types, drug catalog, lab test catalog, insurance
   schemes accepted — all org-wide, not branch-scoped (owned by their respective feature PRDs,
   not this one).
5. **Enable Federation** (optional, any time after onboarding) — a settings toggle; see
   `03-federation-patient-sharing.md` in full. Nothing about the steps above requires it, and
   nothing above is affected if it's never turned on.

## 4. APIs

All endpoints below are internal to one install (called by the org's own admin UI, protected by
`DutyProfile`, super-admin/admin only). No cross-instance calls exist in this document at all —
that entire surface lives in `03`.

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v1/organizations` | POST | admin | Create org (§3 step 1) — creates `Hospital` + main `Branch` in one transaction |
| `/api/v1/organizations/settings` | GET | any logged-in staff | **Built.** The caller's own hospital's settings (organisation from the token): `consultationPayment`, `maxUnpaidBeforeHold` (`11` §6.2), the age-group cutoffs (`06` §2.7) and `patientNumberStart` (`06` §3). Read-only; changed through `PATCH /organizations/:id` |
| `/api/v1/organizations/:id` | GET / PATCH | admin | Read/update org |
| `/api/v1/organizations/:id/branches` | POST / GET | admin | Add/list branches |
| `/api/v1/branches/:id` | PATCH / DELETE | admin | Update branch; delete is soft, blocked if it's `isMainBranch` or has active staff |

## 5. Why / Where / Why Not

- **Why one `Hospital` row is the organization record, not a wrapper table above it** — the
  organization needs exactly one home; a separate `Organization` table sitting above `Hospital`
  would be pure indirection with no product benefit. `Hospital` already *is* the org — every field
  and relation an organization needs lives directly on it. (`Branch` and `Staff` carry no
  `hospitalId` — single-tenancy makes it redundant rather than load-bearing; see `04` §2.3.)
- **Why a group owning several businesses (a hospital + a lab + a pharmacy) isn't modeled as one
  `Hospital` with branches** — those are legally and operationally distinct businesses (separate
  database, subscription, admins). Forcing them into one org's branch list would mean a pharmacy
  POS transaction and a hospital admission share one database for no reason other than a common
  owner. `healthcareNetworkName` captures the "common owner" fact without merging the businesses.
- **Why `Branch` carries no franchise/network concept at all** — a branch is purely "a physical
  location of this one organization." Cross-organization concerns (trust, sharing, discovery)
  are a completely different problem, solved once, in `03`, rather than duplicated at the branch
  level.
- **Why `healthcareNetworkId`/`Name` are plain unenforced fields, not a real relation** — there is
  no database either of them could point to that's shared across installs. They exist purely so
  `03`'s Federation module has something to group/pre-suggest trust by; on their own they enforce
  nothing and grant no access to anything.

## 6. Explicitly Out of Scope for v1

- Anything involving a second organization — trust, sharing, referrals, discovery — lives
  entirely in `03-federation-patient-sharing.md`. This document is complete without it, and
  everything in it works with zero internet connectivity.
- A centralized "Network Console" for a Healthcare Network's head office to manage member
  organizations/licenses centrally is not designed here — see `03` §6 for why that's a separate,
  bigger product surface.

## 7. Open Items for Later PRDs

- Whether `Hospital` should be renamed `Organization` for semantic clarity (it reads incorrectly
  for a standalone Lab or Pharmacy org) — a naming question, not decided in this PRD.
- `Branch`-level scoping for inventory and beds/wards is referenced but owned by the Pharmacy and
  Inpatient feature PRDs respectively.
