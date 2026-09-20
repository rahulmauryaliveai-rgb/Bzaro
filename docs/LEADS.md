# Buyer discovery and leads

How a buyer's "WhatsApp" click becomes leads in seller inboxes, and the rules
that govern those leads. This is the reference for the `Buyer`, `OtpChallenge`,
`Requirement`, `Lead`, `LeadDelivery`, `CreditLedger` and `LeadFlag` models.

Decisions behind this design: D28 (buyer identity), D29 (fan-out outbox), and
the D5 revision (direct leads free, market leads metered).

---

## 1. The buyer flow

```
browse → click "WhatsApp" / "Get Best Price"
      → phone → OTP → requirement form → lead(s) created → wa.me opens
```

- **No popup on page load.** The OTP modal opens only on contact intent.
- **Consent** is collected at the OTP step, verbatim:
  > I agree to share my requirement with the selected supplier and up to 10
  > other verified suppliers.
- **Returning buyers** carry a signed cookie (`bz_buyer`, `__Host-` over https)
  and skip the OTP. The cookie holds only a buyer id; everything else is read
  from the `Buyer` row, including `isBlocked`.
- The cookie is host-only, like the session cookie, so a buyer verified on the
  marketplace is not recognised on a tenant microsite. Accepted cost.

### OTP rules

| Rule | Value | Where |
|---|---|---|
| Length | 6 digits | `src/lib/otp/challenge.ts` |
| Expiry | 5 minutes | same |
| Attempts per code | 3, then locked | `OtpChallenge.attempts`, CHECK constraint |
| Storage | HMAC-SHA256(`OTP_PEPPER`, phone:purpose:code) — never the code | same |
| Resend | deletes the open challenge; the old code stops working | `issueOtp` |
| Sends per phone | 3 / hour | `LIMITS.otp` |
| Sends per IP | 10 / hour | `LIMITS.otpIp` |
| Verify attempts per phone | 12 / hour | `LIMITS.otpVerify` |

Phones are normalised to E.164 (`src/lib/buyer/phone.ts`) **before** any
validation, lookup or rate-limit key is built. A bare 10-digit number is
assumed Indian; anything else must carry `+<country code>`.

---

## 2. Requirement → leads

A `Requirement` is what the buyer wants: product, quantity + unit, city,
timeline, purpose. It carries the matching key (`categoryId`) and the seller
whose product was clicked (`directSellerId`), if any.

The request path does exactly two things in one transaction:

1. Insert the `Requirement` with `fanoutStatus = PENDING`.
2. If there is a `directSellerId`, insert the **DIRECT** `Lead` and its
   `LeadDelivery` rows (`PANEL`, and `WHATSAPP` when the seller has a number).

Everything else — matching, MARKET leads, notifications — happens in the
worker. The request never waits on it.

### Lead types

| | DIRECT | MARKET |
|---|---|---|
| Recipient | the clicked product's seller | 7–10 matched sellers |
| Delivery | WhatsApp + dashboard | dashboard only |
| Buyer phone | visible immediately | masked until accepted |
| Cost to seller | free | 1 credit on accept |
| Expires | never | 48 h after creation |
| `masked` column | always `false` (CHECK) | `true` until accept |
| `expiresAt` | null | required (CHECK) |

A seller sees a given requirement at most once: `@@unique([requirementId,
sellerId])`. The direct seller is excluded from the market fan-out.

### Lead status machine

```
NEW ──(seller opens)──► VIEWED ──(accept, MARKET only)──► ACCEPTED ──► CLOSED
 │                        │                                   │
 └────────(48 h, MARKET)──┴──────────────────────────────► EXPIRED
```

- `NEW → VIEWED` on first open of the lead detail. Records `viewedAt`.
- `VIEWED → ACCEPTED` debits one credit and unmasks the buyer's phone. DIRECT
  leads are never "accepted" — they go `NEW → VIEWED → CLOSED`.
- `→ CLOSED` by the seller at any time (won, lost, not relevant).
- `→ EXPIRED` by the sweeper for MARKET leads in NEW/VIEWED past `expiresAt`.
  ACCEPTED leads never expire.

### The inbox list shows requirements only

`LeadCard` never renders the buyer's name or number — not even masked. Contact
details appear only on the lead page (`/dashboard/leads/[id]`), and opening it
is what flips `NEW → VIEWED`, so the "N new" counter drops only once the seller
has actually looked at the requirement.

### Masking is a read-time decision

The seller-facing projection reveals the buyer's phone when
`type = DIRECT OR status = ACCEPTED`; otherwise it shows `maskPhone()`
(`+91 98765 XXXXX`). The `masked` column exists for the CHECK invariants and
as a cheap filter for the teaser UI — the projection is the source of truth,
so a bug that forgets to flip the column cannot leak a number.

**Non-paying sellers** (plan `leadCreditsPerMonth = 0`, balance 0) still
receive MARKET leads. They see a blurred teaser — category, city, quantity —
and an upgrade CTA. They cannot accept.

---

## 3. Matching

`scoreSellers(requirement)` in `matching.service.ts` (Phase 3):

1. **Candidates**: `SellerCategory.categoryId` ∈ {requirement category and its
   ancestors}, seller `VERIFIED`, not deleted, not `directSellerId`.
2. **Score** (weights from the `leads` setting, defaults in
   `src/lib/validation/lead-settings.ts`):

   | Signal | Default weight | Note |
   |---|---|---|
   | plan tier | 100 × `Plan.sortOrder` | Free 0, Basic 100, Gold 200 — the paid lever |
   | same city | 30 | `Seller.locationId = requirement.locationId` |
   | same cluster | 20 | both cities share `Location.clusterKey` (e.g. `ncr`) |
   | serves city | 10 | row in `SellerServiceArea` |
   | response rate | 20 × `responseRate` | `null` → `neutralResponseRate` (0.5) |
   | primary category | 5 | `SellerCategory.isPrimary` |

   City signals are tiered, not summed: a seller earns the best one only.
3. Take the top `market.maxSellers` (10). If fewer than `market.minSellers`
   (7) qualify, send to however many did — a thin category is still worth a
   lead.

`responseRate` is `leadsAccepted / leadsReceived` over MARKET leads, maintained
on the seller row in the accept transaction and reconciled nightly. It is
**null**, not zero, for a seller with no history, so new sellers are ranked
at the neutral default rather than buried.

### 7-day dedupe

Same `buyerId` + same `fingerprint` (normalised product name + category) with a
`Requirement` in the last `dedupeDays` (7) → the fan-out is `SKIPPED`. The
DIRECT lead is still created: the buyer chose that seller deliberately.

---

## 4. Credits

`CreditLedger` is append-only; `Seller.creditBalance` caches `SUM(delta)`.

| Reason | Delta | When | Idempotency |
|---|---|---|---|
| `MONTHLY_GRANT` | +`Plan.leadCreditsPerMonth` | 1st of month, job | unique (`sellerId`, reason, `periodKey`="YYYY-MM") |
| `LEAD_ACCEPT` | −1 | seller accepts a MARKET lead | one per lead (`leadId`) |
| `FLAG_REFUND` | +1 | admin resolves a flag as REFUNDED | `LeadFlag.refundLedgerId` unique |
| `ADMIN_ADJUST` | any ≠ 0 | admin screen; also the plan-change top-up (note "Plan change top-up for YYYY-MM") | — |

A plan change (`changeSellerPlan`) immediately brings the seller up to the new
plan's grant for the current month (`topUpCreditsForPlanChange`): the first
grant of the month is a `MONTHLY_GRANT`, a later upgrade adds the difference as
an `ADMIN_ADJUST` with the same `periodKey`. Downgrades never claw back.

Defaults: Free 0, Basic 10, Gold 40 per month. Configurable per plan in the
admin plans screen. Unused credits do **not** roll over (the grant is a fixed
delta, not a top-up).

The accept transaction: lock the seller row, re-read `creditBalance`, refuse if
0, insert the ledger row with `balanceAfter`, decrement the cache, flip the
lead. The CHECK `Seller_creditBalance_non_negative` is the backstop against a
race that slips past the lock.

### Flags

A seller may flag an **accepted** MARKET lead once (`LeadFlag.leadId` unique)
with a reason. Admin sees the queue at `/admin/leads/flags` and resolves it
`REFUNDED` (credit returned) or `REJECTED`. Flags on DIRECT leads are allowed
for spam reporting but never refund anything.

---

## 5. The worker

A second PM2 process (`bzaro-worker`, `src/server/worker`) polls two outboxes
with `FOR UPDATE SKIP LOCKED`:

- `Requirement` where `fanoutStatus = PENDING` → match, insert MARKET leads +
  deliveries, mark `DONE` / `SKIPPED` / `FAILED` (`fanoutAttempts`, backoff).
- `LeadDelivery` where `status = PENDING` → hand to `LeadNotifier`, mark
  `SENT` / `FAILED` (retryable errors re-queue with backoff, up to 5 attempts).

Plus a sweep every few minutes: expire MARKET leads past `expiresAt`.

Partial indexes (`*_pending_idx`) keep both polls cheap regardless of table
size. The worker shares `src/lib/db.ts` and the settings memo; it never
imports from `next/*`.

Cron jobs that also touch leads: `prune-events` (expired OTP challenges),
`grant-monthly-credits` (1st of month), `refresh-lead-stats` (nightly
`responseRate` reconcile).

---

## 6. Providers

Both follow the `MailProvider` pattern — interface + console implementation +
factory; no vendor SDK outside the module.

| Interface | Console impl | Real impl (later) | Env |
|---|---|---|---|
| `OtpProvider` (`src/lib/otp`) | prints the code | WhatsApp Cloud API template, SMS fallback | `WHATSAPP_*` |
| `LeadNotifier` (`src/lib/notify`) | prints the message | WhatsApp Cloud API template | `WHATSAPP_*` |

In production without `WHATSAPP_*` the console implementations run and log an
error at boot. Leads still land in the dashboard; nothing is lost.

---

## 7. Privacy

- Buyer phone is the identity key. It is shown to the DIRECT seller (the buyer
  chose them) and to MARKET sellers only after they accept (they paid for it).
- IPs are salted-hashed (`ipHash`) as everywhere else; never stored raw.
- `LeadNotification.summary` is rendered **already masked** for MARKET leads,
  so a notifier can never receive a number it may not show.
- OTP codes are never logged by a production provider.

---

## 8. Seller onboarding

Five steps, resumable; `Seller.onboardingStep` is the pointer.

| Step | Route | Writes | Notes |
|---|---|---|---|
| 1 Account | `/register` | `User` (name, phone, whatsapp, email, password) | OTP (`SELLER_SIGNUP`) verifies the phone in the same submission when a code is entered; without one the account is created unverified and the dashboard checklist keeps asking (D2 `requireVerifiedPhone`). Verify later from `/dashboard/settings`. The seller is signed in and sent to step 2 immediately — the confirmation email is not a gate. |
| 2 Business | `/register/business` | `Seller` (+ `businessType`, address, PIN), `SellerCategory` (1 primary + ≤4 secondary), `SellerServiceArea` (cities served), free subscription | Sets `onboardingStep = TRUST`. |
| 3 Trust | `/register/trust` | GSTIN, year, employees, turnover band, logo, certifications | All optional; "Skip for now" is the same call. Sets `THEME`. |
| 4 Website look | `/register/theme` | `SellerWebsite.templateId` + preset tokens (D33) | Pick a template or keep the default. Sets `CATALOG`. |
| 5 Catalogue | `/register/catalog` | — | Two exits, both set `COMPLETE`: add a product now, or dashboard. |

`/register/business` sends a user who already has a seller to
`stepPath(onboardingStep)`, so a half-finished onboarding resumes where it
stopped. The dashboard overview shows a **profile completion** bar
(`src/lib/onboarding/completion.ts`, weights sum to 100) with the three most
valuable missing items and, until `COMPLETE`, a "continue where you left off"
link. Fixed lists (business types, size and turnover bands, certifications)
live in `src/lib/validation/business-lists.ts`; the profile page edits the
same fields plus cities served.
