# Service PRD — CareFusion Cloud Directory

Status: Draft · Last updated: 2026-07-05

This is a PRD for a **separate service, in its own repository** — not part of the
carefusion-microservice modular monolith. No shared code, no shared database, no shared
deployment. It is referenced by `docs/PRD/features/03-federation-patient-sharing.md` in the main
repo, which calls this service's API as an external HTTP dependency. This document is written to
be lifted wholesale into that new repo's own `docs/PRD.md` (or equivalent).

This service exists specifically for **franchise membership management**: an organization group
(e.g. "Evercare Health Group") registers its member organizations here so those siblings can find
and trust each other for referral data sharing. An organization with no franchise can still
register a standalone listing, but standalone listings are not searchable by anyone else — there
is no "browse all organizations" capability in this service, by design (§6).

## 1. What This Service Is

A lightweight, standalone registry of **franchise membership** that lets one CareFusion install
discover its own franchise siblings' public connection details (name, location, endpoint, public
key) — nothing more. Every CareFusion install works completely without this service; it exists
purely to make Federation (`03`) trust-building easier for organizations that belong to a
franchise, instead of manually exchanging files between admins for every sibling.

**It never stores or sees patient/clinical data of any kind.** No `Patient`, no `PatientShare`
payload, no medical anything ever reaches this service. It only ever holds public organization
metadata that an org itself chooses to publish for the purpose of being found by its own siblings.

It also **never participates in the trust handshake or any data exchange** between two
CareFusion installs. Once an install finds a sibling's endpoint/public key here, everything that
follows (the handshake, every `PatientShare`) happens directly between those two installs' own
servers — this service isn't in that path and can't see it.

## 2. Data Model

```prisma
model DirectoryAccount {
  id           String        @id @default(uuid())
  contactEmail String        @unique
  apiKeyHash   String                          // hashed — the raw key is shown once at issuance, never stored
  status       AccountStatus @default(ACTIVE)
  createdAt    DateTime      @default(now())

  franchises    Franchise[]
  organizations DirectoryOrganization[]        // standalone orgs directly under this account (no franchise)
}

enum AccountStatus {
  ACTIVE
  SUSPENDED
}

model Franchise {
  id        String   @id @default(uuid())
  accountId String                             // the account that manages this franchise's listings
  name      String                             // e.g. "Evercare Health Group"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  account       DirectoryAccount        @relation(fields: [accountId], references: [id], onDelete: Cascade)
  organizations DirectoryOrganization[]

  @@index([accountId])
}

model DirectoryOrganization {
  id                  String   @id @default(uuid())
  accountId           String
  franchiseId         String?                  // null = standalone, not part of any franchise
  localOrganizationId String                    // the org's own id in ITS OWN CareFusion database — opaque here, never dereferenced
  name                String
  businessType        BusinessType              // HOSPITAL | LABORATORY | PHARMACY — mirrors the core enum, for display only
  country             String
  state               String
  publicEndpoint      String
  publicKey           String                    // PEM — used by peers to verify this org's signed requests
  verificationStatus  VerificationStatus @default(PENDING)
  listingStatus       ListingStatus      @default(ACTIVE)
  lastHeartbeatAt     DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  account   DirectoryAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  franchise Franchise?       @relation(fields: [franchiseId], references: [id])

  @@index([franchiseId])
  @@index([accountId])
}

enum BusinessType {
  HOSPITAL
  LABORATORY
  PHARMACY
}

enum VerificationStatus {
  PENDING
  VERIFIED
  REJECTED
}

enum ListingStatus {
  ACTIVE
  SUSPENDED
  DEREGISTERED
}
```

**Why three models, not two:** `DirectoryAccount` is the login (who controls the API key, gets
billed, receives abuse notices) — a separate concern from what's being listed. `Franchise` is the
optional group a set of sibling organizations belong to; it's what makes the Account/Organization
split load-bearing — one account manages either a franchise's worth of sibling listings, or a
single standalone listing directly. `franchiseId` is nullable on `DirectoryOrganization`
specifically to support the standalone case — an org with no group to share with still gets a
listing, it's just never returned by anyone else's search (§5).

## 3. Verification Model

On registration or endpoint/key update, the directory issues an **endpoint challenge**: it calls
the submitted `publicEndpoint` with a signed, single-use nonce; the CareFusion install must echo
it back correctly (proving it actually controls that endpoint) within a short window (e.g. 60s).
On success, `verificationStatus → VERIFIED` automatically — no manual review needed for normal
operation. The operator retains the ability to manually set `REJECTED` for abuse (spam listings,
impersonation reports), which removes the listing from search regardless of `VERIFIED` status.

This is deliberately lightweight (proof of endpoint control, not proof of legal identity) — it
stops trivial spoofing (someone listing an endpoint they don't control) without requiring the
operator to manually review every signup, which wouldn't scale and isn't the operator's job here.

## 4. Heartbeat & Staleness

A registered install re-confirms itself periodically (recommended: daily) via the heartbeat
endpoint. Missing a configurable number of consecutive heartbeats (recommended: 3) auto-flips
`listingStatus → SUSPENDED`, dropping it from search results without requiring manual cleanup.
Sending a heartbeat or a successful update reactivates it (`ACTIVE`) automatically.

## 5. APIs

All endpoints are called **by a CareFusion install**, never by an end user or hospital staff
member directly — from that install's own Federation module (`03` §2.1 Path 2), server-side.

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/v1/accounts/signup` | POST | none | Body: `{ contactEmail }`. Sends a verification link; completing it issues the account's first API key (shown once, never retrievable again). |
| `/v1/franchises` | POST | account API key | Body: `{ name }`. Creates a franchise under the caller's own account. |
| `/v1/organizations` | POST | account API key | Register a listing. Body: `{ localOrganizationId, name, businessType, country, state, franchiseId?, publicEndpoint, publicKey }`. `franchiseId` must belong to the caller's own account if provided; omit it for a standalone listing. Triggers the endpoint challenge (§3). |
| `/v1/organizations/:id` | PATCH | account API key | Update endpoint/key/franchise membership; re-triggers the endpoint challenge if `publicEndpoint` or `publicKey` changed. |
| `/v1/organizations/:id/heartbeat` | POST | account API key | Keep-alive; resets the missed-heartbeat counter. |
| `/v1/organizations/:id/siblings` | GET | account API key, scoped to the calling `DirectoryOrganization` | **Scoped search.** Returns every other `VERIFIED`, `ACTIVE` listing sharing this organization's `franchiseId` — nothing else. If the caller's own listing has no `franchiseId` (standalone), returns an empty list; there is no broader search. Each result: `{ name, businessType, country, state, verificationStatus, publicEndpoint, publicKey }` — never `contactEmail`, `accountId`, or any account-level field. |
| `/v1/organizations/:id` | DELETE | account API key | Deregister (soft — `listingStatus → DEREGISTERED`). |

## 6. Explicit Non-Goals

- **Does not help two organizations with no shared franchise discover each other.** There is no
  general "browse/search all organizations" capability — only "list my own franchise's other
  members." Two unrelated organizations (a hospital and an independent external lab, say) cannot
  find each other through this service at all; they use manual export/import instead
  (`03` §2.1 Path 1). This is deliberate, not a missing feature — see `03` §5 for why.
- Never stores, transmits, or has visibility into patient or clinical data of any kind.
- Never proxies, participates in, or has visibility into the trust handshake or any
  `PatientShare` exchange between two installs — those happen directly, peer-to-peer.
- Never authenticates end users (doctors, patients, staff) of any hospital — it only
  authenticates the installs themselves, via account-level API keys.
- Not a source of truth for anything beyond franchise membership as recorded here —
  `businessType`/`country`/`state` are for display only, mirrored from the core app at
  registration time, never re-validated against it.

## 7. Open Items

- Rate limiting / abuse prevention on `siblings` and `signup` — not designed here, needed before
  public launch.
- Whether `DELETE` should also purge the row or only soft-flag it (current design: soft,
  matching the main product's audit conventions) — revisit based on data-retention requirements
  once this repo has its own policy.
- Whether an account should be allowed to manage more than one `Franchise` (current schema
  permits it — `DirectoryAccount.franchises` is a list) or whether that should be constrained to
  one franchise per account at the API layer. Left open; the schema doesn't force a decision
  either way.
