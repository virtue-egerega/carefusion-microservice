# Feature PRD — Federation & Cross-Organization Patient Sharing

Status: Draft · Last updated: 2026-07-05
Depends on: `02-hospital-onboarding.md` (Organization/Branch), `01-cloud-directory-service.md`
(external, optional franchise-membership registry), and — for the `Patient` entity referenced
throughout `PatientShare` below — a Patient-management PRD that hasn't been written yet in this
repo. This doc is numbered last of the three existing PRDs for that reason, and may need to move
again once a Patient-management PRD exists ahead of it.

This entire document describes an **optional module**. Every install ships with it available but
disabled. With it off, nothing in this doc loads, no new tables are queried, and the core
application behaves exactly as `02` describes — fully functional with zero internet connectivity.
Turning it on is a per-install admin decision (`Settings → Enable Federation`), not something a
Healthcare Network or anyone else can force on remotely.

## 1. What Problem This Solves

Two independently-deployed organizations — a hospital and a diagnostics center under the same
brand, two unrelated hospitals, a clinic and an external specialist — sometimes need to send a
specific patient's data to each other, with that patient's consent, at the moment of a referral.
Neither shares a database. Neither is continuously connected to the other. This module is the
mechanism for that one act — nothing more. It does not replicate records, does not keep two
organizations in sync, and does not let one organization browse another's data.

Two separate sub-problems, kept deliberately apart:

- **Trust** — do org A and org B believe each other's identity enough to exchange anything?
- **Discovery** — how does org A even find out org B exists and how to reach it?

## 2. Trust: `OrganizationTrust`

A local record, held independently by each side (there is no shared row — org A's copy and org
B's copy live in two different databases and can drift, e.g. one side revokes while the other
hasn't heard yet):

```prisma
model OrganizationTrust {
  id                    String   @id @default(uuid())
  peerOrganizationLabel String                          // human name of the other org, e.g. "Evercare Diagnostics"
  peerEndpoint          String                          // their base API URL
  peerPublicKey         String                          // used to verify signed requests FROM them
  ourApiKeyForPeer      String                          // credential WE present when calling THEM
  peerApiKeyForUs       String                          // credential THEY present when calling US
  allowedDataCategories SharedDataCategory[]          // what's permitted to flow with this specific peer
  sourcedVia            TrustSource                      // MANUAL_IMPORT | DIRECTORY
  status                TrustStatus @default(PENDING)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  shares                PatientShare[]
}

enum SharedDataCategory {
  IDENTITY          // name, DOB, sex, national/NFC ID, contact
  ALLERGIES
  MEDICATIONS       // active prescriptions
  VISIT_SUMMARY     // recent diagnosis/visit summary text
}

enum TrustSource {
  MANUAL_IMPORT
  DIRECTORY
}

enum TrustStatus {
  PENDING
  ACTIVE
  REVOKED
}
```

Any two organizations can establish this — belonging to the same franchise (`01`) is a
convenience for finding/pre-approving peers faster, never a requirement. A hospital and a
completely unaffiliated external lab go through the exact same mechanism, just via Path 1 only
(§2.1), since the Directory won't surface them to each other (`01` §6).

### 2.1 Establishing trust — two paths

Both end at the same place (a local `OrganizationTrust(status=ACTIVE)` row on both sides via
a direct handshake); they only differ in how the two sides first learn each other's
endpoint/public key.

**Path 1 — Manual export/import (always available, zero infrastructure).**
1. Org A: `POST /api/v1/federation/trust/export` → returns an "Organization Package":
   `{ organizationLabel, endpoint, publicKey }`, renderable as a downloadable file or QR code.
2. Org A's admin delivers it to Org B out of band (email, USB, scan).
3. Org B: `POST /api/v1/federation/trust/import` with that package → creates a local
   `OrganizationTrust(status=PENDING, sourcedVia=MANUAL_IMPORT)`.
4. Either side triggers `POST /api/v1/federation/trust/handshake` against the other's `endpoint`
   (signed with its own key); on mutual confirmation both sides flip their local row to `ACTIVE`
   and exchange the `ourApiKeyForPeer`/`peerApiKeyForUs` values used for every call after this.

This is the **only** path available to two organizations that don't share a franchise in the
Cloud Directory — including two orgs that never registered with the directory at all.

**Path 2 — Directory-assisted (franchise siblings, one at a time or in bulk).**
1. Org B: `POST /api/v1/federation/directory/siblings` (server-side proxy to
   `GET /v1/organizations/:id/siblings` on the external Cloud Directory, `01` §5 — the directory's
   own API key never reaches the browser).
2. Directory returns only Org B's own franchise siblings' public listings
   (`name, businessType, country, state, endpoint, publicKey`) — nothing else is returned, and if
   Org B isn't in a franchise the list is empty.
3. The admin either picks one sibling to trust, or bulk-confirms all returned siblings in one
   action — both are the same underlying call, differing only in how many peers get queued for
   step 4 below. From here it's identical to Path 1 steps 3–4 for each chosen peer, with
   `sourcedVia=DIRECTORY`. **The directory never participates in the handshake itself** — it only
   helped Org B learn its siblings' endpoint/key, exactly as Path 1's manual export would have.

## 3. Sharing: `PatientShare` and `PatientShareBranch`

Sharing is **organization → organization**, never branch → branch. The receiving org decides,
after the fact, which of its *own* branches may see what came in.

```prisma
model PatientShare {
  id                   String   @id @default(uuid())
  patientId            String                          // our local patient (outbound) or the newly matched/created one (inbound)
  direction            ReferralDirection
  organizationTrustId  String
  peerPatientRef       String?                         // peer's own reference to this patient, once known
  dataCategoriesShared SharedDataCategory[]
  payloadSnapshot      Json                            // exact data packet sent/received — audit copy, per allowed categories
  consentMethod        ConsentMethod
  consentedBy          String                          // patient or guardian name/identifier captured at consent time
  consentedAt          DateTime
  initiatedByStaffId   String
  expiresAt            DateTime?                       // optional time-box on how long the receiving org's access is considered valid
  status               ShareStatus @default(SENT)
  respondedAt          DateTime?
  createdAt            DateTime @default(now())

  organizationTrust    OrganizationTrust @relation(fields: [organizationTrustId], references: [id])
  branchGrants         PatientShareBranch[]

  @@index([patientId])
  @@index([organizationTrustId, status])
}

model PatientShareBranch {
  id             String   @id @default(uuid())
  patientShareId String
  branchId       String                                // a LOCAL branch id — only meaningful on the receiving org's own database
  grantedAt      DateTime @default(now())
  grantedBy      String

  patientShare   PatientShare @relation(fields: [patientShareId], references: [id], onDelete: Cascade)
  branch         Branch       @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([patientShareId, branchId])
}

enum ReferralDirection {
  OUTBOUND
  INBOUND
}

enum ConsentMethod {
  OTP
  SIGNATURE
  VERBAL_LOGGED
}

enum ShareStatus {
  SENT
  ACKNOWLEDGED
  FAILED
  REJECTED
  EXPIRED
}
```

`PatientShareBranch` rows are only ever created against an **INBOUND** `PatientShare` — once a
share lands, the receiving org's admin/doctor picks which of their own branches can see it
(`PATCH /api/v1/patients/shares/:id/branches`). An outbound share doesn't need this: the sending
org already knows and controls its own branch access via ordinary staff/branch scoping (`02`
§2.2).

## 4. APIs

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v1/federation/trust/export` | POST | admin | Generate an Organization Package for manual pairing |
| `/api/v1/federation/trust/import` | POST | admin | Import a peer's package → `OrganizationTrust(PENDING)` |
| `/api/v1/federation/trust/handshake` | POST | peer (signed) | Mutual confirmation → both sides flip to `ACTIVE`, exchange API keys |
| `/api/v1/federation/directory/siblings` | POST | admin | Server-side proxy to the external Cloud Directory's scoped `siblings` lookup (`01` §5) |
| `/api/v1/patients/:id/share` | POST | hospital staff | **Outbound.** Body: `{ organizationTrustId, dataCategories[], consentMethod, consentedBy, expiresAt? }`. Server assembles the payload restricted to the intersection of the requested categories and `OrganizationTrust.allowedDataCategories`, signs it, POSTs to the peer's inbound endpoint, writes `PatientShare(direction=OUTBOUND)`. |
| `/api/v1/federation/shares/inbound` | POST | peer API key | **Inbound**, called BY a peer. Body: `{ peerOrganizationLabel, peerPatientRef, dataCategoriesShared[], payload, consentMethod, consentedBy, consentedAt, initiatedByStaffId }`. Matches/creates a local `Patient`, writes `PatientShare(direction=INBOUND)`, responds `{ localPatientId, status: "ACKNOWLEDGED" }`. |
| `/api/v1/patients/shares/:id/branches` | PATCH | hospital staff | Receiving org grants/revokes which local branches can see an inbound share |

Consent is captured as fields on the share request itself, not a separate consent endpoint — it's
one atomic clinical act (a staff member sharing a specific, consenting patient right now), not a
multi-step flow with its own state machine.

## 5. Why / Where / Why Not

- **Why sharing targets an organization, not a branch** — the sending org doesn't know or manage
  the receiving org's internal branch structure, and shouldn't have to. "Share with Evercare
  Diagnostics" is a decision the sending doctor can make; "which of Evercare's branches should see
  it" is a decision only Evercare can make, after the fact, about their own structure.
- **Why trust isn't gated behind franchise membership** — trust is a relationship between two
  specific organizations, not an ownership fact. A hospital and an independent external lab with
  no shared franchise need to establish exactly the same kind of trust as two sibling hospitals
  under one brand — they just do it entirely via Path 1, since the Directory won't surface them to
  each other. Franchise membership only ever makes Path 2 available; it never blocks Path 1.
- **Why Path 2 is a single mechanism, not "directory search" and "network auto-trust" as separate
  paths** — since the Directory (`01`) only ever returns an org's own franchise siblings, trusting
  one sibling and bulk-trusting all of them are the same API call (`directory/siblings`); the only
  difference is a UI choice, not a different mechanism.
- **Why the Directory (`01`) never touches the handshake or the data** — it only ever answers
  "who are my franchise siblings, and what's their public endpoint/key." The actual trust
  handshake and every `PatientShare` payload move directly between the two organizations' own
  installs. This keeps the directory operator (even though in practice that's the same person
  running this product) out of the chain of custody for any patient data.
- **Why identity + clinical summary categories, not full chart replication** — enough for a peer
  to treat the patient safely without becoming a full record-replication system: smaller consent
  ask per event, smaller breach blast radius if any one peer's install is compromised.
- **Why per-event consent instead of a blanket agreement** — matches standard health-data
  expectations (the patient controls disclosure to a specific third party at a specific moment)
  and produces one clean, auditable consent record per disclosure instead of one ambiguous
  standing agreement covering everything, forever.
- **Why manual export/import is the baseline path, not the directory** — the product's original
  and enduring philosophy is zero required infrastructure and zero required internet
  connectivity. An org that never wants to touch the cloud directory, or that needs to trust a
  peer outside its own franchise, can still federate with a known peer entirely
  offline-at-pairing-time (deliver the package by USB, confirm the handshake whenever both sides
  next have connectivity). The directory is an optional accelerant for franchise siblings,
  never a dependency.

## 6. Explicitly Out of Scope for v1

- **On-demand cross-instance lookup ("pull")** — a peer querying us live for a patient we haven't
  explicitly shared. Only push is built; if needed later it's a new endpoint, not a change to the
  model above.
- **Consent withdrawal / propagated deletion** — if a patient later withdraws consent after a
  share already happened, there's no mechanism to request the peer delete their copy. Flagged as
  a real gap, not solved here — needs its own follow-up before this ships to a real customer
  handling sensitive categories at scale.
- **Identity conflict resolution** — if the same person ends up with divergent records across
  peers (spelling differences, no shared national ID), there's no merge/reconciliation process.
  Each `PatientShare` is a point-in-time snapshot, not a synced record.
- **A centralized "Network Console"** for a Healthcare Network's head office to see all member
  orgs, manage sharing policy, or manage licenses centrally. That requires the network operator to
  run *additional* shared infrastructure beyond any single member's own install — a materially
  bigger, separate product, not designed here.
