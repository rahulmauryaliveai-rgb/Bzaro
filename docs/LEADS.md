# Buyer discovery and leads

How a buyer's "WhatsApp" click becomes leads in seller inboxes, and the rules
that govern those leads. This is the reference for the `BuyerProfile`,
`EmailOtp`, `Requirement`, `Lead`, `LeadDelivery`, `CreditLedger` and `LeadFlag`
models.

Decisions behind this design: D35 (buyer identity — **supersedes D28**), D29
(fan-out outbox), and the D5 revision (direct leads free, market leads metered).

---

## 1. The buyer flow

```
browse → click "WhatsApp" / "Get Best Price"
      → requirement form → (sign in / create account, if needed)
      → lead(s) created → wa.me opens
```

- **No popup on page load.** The modal opens only on contact intent.
- **A buyer is a `User`** — email + password (verified by an `EmailOtp`) or
  Google — plus a `BuyerProfile` holding the last city, pincode and optional
  lat/lng. Identity comes from the Auth.js session; there is no buyer cookie.
- **The requirement comes first.** A signed-out buyer fills the form and is
  asked to sign in at "Send", so the cost of an account lands after they have
  already decided what they want.
- **Consent** is shown above the Submit button and stored per requirement as
  `consentVersion` + `consentAt`. The wording lives in `src/lib/consent.ts` and
  is versioned, never edited in place — existing rows point at their version.
- `BuyerProfile.isBlocked` gates contact, replacing the old per-phone block.

### Email OTP rules

| Rule | Value | Where |
|---|---|---|
| Length | 6 digits | `EmailOtp` |
| Expiry | 10 minutes | `EmailOtp.expiresAt` |
| Attempts per code | 5, then locked | `EmailOtp.attempts`, CHECK constraint |
| Storage | HMAC of the code — never the code itself | same rule as `OtpChallenge` |
| Purposes | `SIGNUP`, `RESET_PASSWORD` | `EmailOtpPurpose` |

`OtpChallenge` and its phone OTP still exist, but only for **seller** onboarding
(`OtpPurpose.SELLER_SIGNUP`). Phones are still normalised to E.164
(`src/lib/buyer/phone.ts`) before any validation, lookup or rate-limit key is
built.

`User.phone` is **nullable** — a Google sign-up may not have given one — so lead
projections render "no phone provided" rather than a masked placeholder.

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
NEW ─(seller opens)─► VIEWED ─(accept, MARKET only)─► ACCEPTED ─► CONTACTED ─► WON
 │                      │                                │           │        └► LOST
 │                      │                                └───────────┴──────► CLOSED
 └──────(48 h, MARKET)──┴────────────────────────────────────────────────► EXPIRED
```

- `NEW → VIEWED` on first open of the lead detail. Records `viewedAt`.
- `VIEWED → ACCEPTED` debits one credit and unmasks the buyer's phone. DIRECT
  leads are never "accepted" — they go `NEW → VIEWED → CONTACTED → WON/LOST`.
- `CONTACTED`, `WON` and `LOST` are the seller's own progress markers after they
  have the buyer's number. They carry no credit or masking effect.
- `→ CLOSED` by the seller at any time (not relevant, duplicate).
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

- The buyer's email is the identity key; their phone is the contact detail
  sellers want. It is shown to the DIRECT seller (the buyer chose them) and to
  MARKET sellers only after they accept (they paid for it).
- `DemandAlert` carries no buyer column at all, and bands the quantity — an
  exact quantity plus a timestamp would re-identify the order behind it.
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

---

## 9. Commerce (Phase 5/6)

Carts and orders exist **only** on `{seller}.bzaro.in`, never on the apex. The
guard is enforced three times, deliberately: the proxy 404s `/site/*` on the
apex, the cart and checkout pages resolve the seller from the route and 404 if
it cannot take payment, and every cart/checkout Server Action re-derives the
seller from the **request Host** and refuses on the apex. A Server Action is a
POST endpoint; not rendering a button is not a control.

### Add to cart vs. Get Quote

`Add to cart` appears only when both are true:

| Condition | Where |
|---|---|
| `SellerFeature.paymentsEnabled` (plan, add-on, or admin override) | `getSellerFeatures` |
| A `SellerIntegration` of type RAZORPAY with `enabled = true` | `canAcceptPayments` |

Plus the product must have a real price — `priceOnRequest` products stay
enquiry-only even in a store that takes payment. Everywhere else the contact
buttons are the only call to action.

### Money

Bzaro never holds it. Each seller stores **their own** Razorpay key pair,
AES-256-GCM encrypted under `INTEGRATIONS_ENCRYPTION_KEY`; the order is created
against the seller's account and settles there. The decrypted config leaves
`integration.service.ts` only through `getRazorpayConfig` / `getShiprocketConfig`.

### Confirming a payment

Two independent paths, both idempotent:

1. **Browser callback** — fast, optional. The signature
   (`HMAC(keySecret, orderId|paymentId)`) is verified server-side; the browser
   saying "paid" is not evidence of payment.
2. **Webhook** (`/api/webhooks/razorpay`) — reliable. Verified against the
   seller's webhook secret over the **raw** body, and de-duplicated through
   `WebhookEvent (provider, eventId)`.

`markPaid` is a guarded `updateMany`, so whichever arrives first does the work
and the other is a provable no-op. That is what stops a duplicate delivery
fanning out two sets of demand alerts.

### Demand alerts

A paid order creates an `Order` for exactly one seller — never a lead — and an
anonymous `DemandAlert` for up to 20 other verified sellers in the same category
and city. The alert carries no buyer column of any kind and the quantity is
**banded** (`quantityBand`), because an exact quantity plus a timestamp would
re-identify the order behind it.

### Shipping

Shiprocket has no API-key auth: an email and password are exchanged for a
bearer token that lasts ~10 days. That token is cached inside the seller's own
encrypted config and refreshed a day early, so a burst of shipments costs one
login rather than one per order. Re-saving credentials deliberately discards the
cached token — reusing one minted from the old password would hide a typo until
it expired days later.

`createShipmentForOrder` claims the order with a guarded `updateMany` on
`shiprocketOrderId` **before** calling out, so a double-click or a retried
webhook cannot book two real pickups. Failure is never fatal: the order stays
paid and unshipped with the reason recorded, for the seller to book by hand.

Auto-create is opt-in per seller. When it is off, the Orders tab shows
"Ship now".
