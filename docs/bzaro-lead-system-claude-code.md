# Bzaro — Buyer Auth, Lead System, Cart & Integrations
Implementation brief for Claude Code. Run **one phase at a time**. After each phase: review, test, commit, then start the next.

---

## How to use this file

1. Save this file in the repo root as `docs/lead-system-plan.md`.
2. Open Claude Code in the project folder and start every phase with:

```
Read docs/lead-system-plan.md. We are doing Phase <N> only.
First explore the relevant parts of the codebase and show me a plan
(files to create/change, schema changes, risks). Wait for my approval
before writing code. Do not touch other phases.
```

3. After each phase: `npm run build`, test the flow manually, commit with a clear message.

---

## Project context (for Claude Code)

- **Bzaro**: multi-tenant B2B marketplace. Apex `bzaro.in` = marketplace; `<seller>.bzaro.in` = free seller storefronts.
- **Stack**: Next.js 16 (App Router), React 19, Prisma 7 + Postgres 16, NextAuth v5, Tailwind 4, shadcn/ui, Cloudinary, Upstash-compatible rate limiting (Redis 7 via SRH), PM2 + nginx on a VPS, Cloudflare DNS.
- **Rules**: keep existing seller/admin auth working; reuse existing tenant-resolution middleware; server actions or route handlers with Zod validation; no secrets in client code; all new UI mobile-first and accessible (labels, focus states, 44px touch targets).

---

## Business rules (source of truth)

**Buyer account**
- Signup: name, email, phone, password → 6-digit **email OTP via Resend** → account active.
- Login: email + password. Also "Continue with Google" (then ask phone once).
- Phone stored with `phoneVerified = false` (SMS OTP comes later).
- One session across `bzaro.in` and all `*.bzaro.in` subdomains.

**Location**
- Search/category pages are always open (no login gate; must stay crawlable).
- Auto-detect approximate city from IP; show "📍 Showing sellers near {city} · Change".
- Precise location only after a user action (pre-prompt, then browser permission). Fallback: pincode or city dropdown.
- Saved in cookie (guest) and buyer profile (logged in). Pre-fills requirement form.

**Requirement form** (same component everywhere)
- Fields: product (pre-selected), quantity + unit, location (pincode → city), when to buy (IMMEDIATE / WITHIN_WEEK / WITHIN_MONTH), purpose (PERSONAL / BUSINESS / RESELLER), business name + GST (only for BUSINESS/RESELLER), message (optional).
- Consent notice **above** Submit: "By submitting, you agree that your requirement may be shared with verified sellers on Bzaro to get you the best price. [Privacy Policy]". Store consent text version + timestamp.
- Flow for logged-out buyer: fill requirement → "Create account to send" (signup/login in same modal) → draft auto-submits after verification.

**Triggers**
- Bzaro.in: Call, WhatsApp, Enquiry on a product → requirement form. Search results page shows a "Tell us your requirement" card.
- Seller store: Call, WhatsApp, Enquiry/Get Quote → requirement form.
- "Visit Store" on Bzaro.in opens the store directly with `?ref=bzaro` (first-touch cookie, 30 days).

**Lead routing (on submit, immediate)**
- Product's seller → **DIRECT** lead (full buyer details).
- Other matched sellers (same category, city match, plan tier, response rate; default max 5, configurable) → **MARKET** lead; buyer phone masked until seller accepts.
- Record `source` (BZARO_MARKETPLACE / STOREFRONT) and `ref=bzaro` attribution.
- After submit for Call/WhatsApp: reveal number / open `wa.me` with prefilled message.

**Cart & orders (seller stores only)**
- Add to Cart shown only if the store has Payments enabled; otherwise button = "Get Quote".
- Never on apex `bzaro.in` (enforce in route handlers, not just UI).
- Cart is per store, server-side, tied to buyer.
- Checkout → **Order** in that seller's Orders tab only (never a lead).
- Other sellers in the category/city get an anonymous **Demand Alert** (product, quantity band, city, date — no buyer data).

**Integrations (seller dashboard)**
- Payments (Razorpay, seller's own account keys) and Shipping (Shiprocket, seller's own API user).
- Unlocked by plan/add-on (₹2,000 = Payments; ₹5,000 = Payments + Shipping) or admin override.

---

## Phase 0 — Prerequisites (do before Phase 2)

- **Wildcard TLS for `*.bzaro.in`** (Cloudflare proxy or wildcard cert). Required because the shared secure session cookie, browser geolocation and payments all need HTTPS on subdomains.
- After TLS is live: restore full HSTS (`includeSubDomains; preload`) and commit the VPS-only `next.config.ts` change so repo and server match.
- Resend: add domain `mail.bzaro.in`, set SPF, DKIM, DMARC in Cloudflare DNS, get API key.
- Cloudflare: enable "Add visitor location headers" managed transform (gives `cf-ipcity`, `cf-region`, `cf-ipcountry`).
- Cloudflare Turnstile: create site key + secret.
- Env vars: `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` (32-byte base64), `AUTH_COOKIE_DOMAIN=.bzaro.in`.

---

## Phase 1 — Database schema (Prisma)

Add models/enums (adapt names to existing conventions; extend existing `User` with a BUYER role if one exists):

- `BuyerProfile` — userId, phone, phoneVerified, city, pincode, lat/lng (optional), createdAt.
- `EmailOtp` — email, codeHash, purpose (SIGNUP / RESET_PASSWORD), expiresAt, attempts, consumedAt.
- `Pincode` — pincode, city, district, state (seed from India Post dataset, NCR first).
- `Requirement` — buyerId, productId?, categoryId, quantity, unit, city, pincode, timeline, purpose, businessName?, gst?, message?, trigger (CALL / WHATSAPP / ENQUIRY / SEARCH_CARD), source, refBzaro, consentVersion, consentAt.
- `Lead` — requirementId, sellerId, type (DIRECT / MARKET), status (NEW / VIEWED / ACCEPTED / CONTACTED / WON / LOST), phoneMasked, acceptedAt; unique (requirementId, sellerId).
- `Cart`, `CartItem` — per buyer per store.
- `Order`, `OrderItem` — sellerId, buyerId, totals, paymentStatus, razorpayOrderId, razorpayPaymentId, shippingStatus, shiprocketOrderId, awb, trackingUrl, address snapshot.
- `DemandAlert` — categoryId, productName, quantityBand, city, sellerId (recipient), createdAt, readAt. No buyer fields.
- `SellerIntegration` — sellerId, type (RAZORPAY / SHIPROCKET), enabled, mode (TEST / LIVE), encryptedConfig, lastTestedAt, lastTestOk.
- `SellerFeature` — sellerId, paymentsEnabled, shippingEnabled, source (PLAN / ADDON / ADMIN_OVERRIDE).

Indexes: `Lead(sellerId, status, createdAt)`, `Requirement(buyerId, createdAt)`, `DemandAlert(sellerId, readAt)`. Generate migration, do not reset prod data.

---

## Phase 2 — Buyer auth (NextAuth v5 + Resend)

- Keep NextAuth v5 (already in the project). Add Credentials provider for buyers + Google provider.
- Signup server action: validate (Zod), Turnstile check, hash password (argon2 or bcrypt), create user as unverified, send OTP.
- Email OTP: 6 digits, stored hashed, 10-min expiry, max 5 attempts then 15-min lock, resend after 60s, max 5/hour (Upstash rate limit per email + IP).
- Resend React Email template: subject "Your Bzaro verification code: 123456", plain text fallback, "check spam" hint in UI.
- Forgot password using the same OTP flow.
- Login rate limiting + Turnstile after 3 failures.
- Google login → if no phone on profile, show one-time phone step.
- Session cookie domain `.bzaro.in`, `secure`, `httpOnly`, `sameSite=lax`, so login works on all subdomains. Verify existing seller/admin sessions are unaffected.
- UI: `AuthModal` (signup / login / OTP / forgot) usable from any page and inside the requirement modal.

---

## Phase 3 — Location

- Server util reads `cf-ipcity` / `cf-region` → default city cookie (`bz_loc`).
- `LocationBar` component: "📍 Showing sellers near {city} · Change".
- `LocationPicker` sheet: "Use my current location" (pre-prompt → `navigator.geolocation`), pincode input (lookup in `Pincode` table), NCR city list.
- lat/lng → nearest pincode via DB (no paid geocoding API).
- Sync to `BuyerProfile` when logged in. Search and matching use this city.

---

## Phase 4 — Requirement form + lead routing

- `RequirementModal` (shadcn Dialog on desktop, Drawer on mobile), 2 steps: requirement → auth (if needed).
- Draft saved in sessionStorage + server after auth, then auto-submitted.
- Consent notice above Submit, versioned constant.
- Wire triggers on product cards/pages (Bzaro.in + storefronts) and a `RequirementCard` on search results.
- `routeRequirement(requirementId)` service: create DIRECT lead for product's seller; select MARKET sellers (category + city + plan tier + response rate, exclude product's seller, limit configurable); create leads; enqueue notifications (seller WhatsApp/email later — create a `notifyLead` stub).
- Duplicate guard: same buyer + product within 7 days → update existing requirement.
- Post-submit: CALL → reveal seller phone; WHATSAPP → open `wa.me` with prefilled text.

---

## Phase 5 — Cart & checkout (storefronts only)

- Tenant guard: all cart/checkout routes return 404 on apex.
- Add to Cart visible only if `SellerFeature.paymentsEnabled` and a working Razorpay integration; else "Get Quote" (requirement form).
- Cart drawer, quantity update, per-store cart.
- Checkout: address, create Razorpay order server-side with seller's decrypted keys, Razorpay Checkout on client, verify signature server-side, confirm via webhook (`payment.captured`), idempotent.
- On paid: create Order → seller Orders tab; create anonymous DemandAlerts for other matched sellers.
- COD option if seller enables it.

---

## Phase 6 — Admin feature flags + seller integrations

**Admin**
- Per-seller toggles: Payments, Shipping; source badge (Plan / Add-on / Admin override); audit log.

**Seller dashboard → Settings → Payments**
- Razorpay Key ID, Key Secret, Webhook Secret; Test/Live mode.
- "Test connection" (fetch a harmless API call) with clear success/error.
- Show webhook URL to copy; step-by-step guide with screenshots placeholders.
- Secrets encrypted with AES-256-GCM (`INTEGRATIONS_ENCRYPTION_KEY`), never returned to client after save (show `••••last4`).

**Seller dashboard → Settings → Shipping**
- Shiprocket API user email/password (encrypted), pickup address, default package dims/weight.
- Token caching (Shiprocket tokens expire; refresh automatically).
- "Test connection"; toggle auto-create shipment on paid order vs manual "Ship now".
- Save AWB + tracking URL on Order; tracking link to buyer by email.

Locked state UI when not enabled: explain benefit + "Upgrade / Buy add-on" CTA.

---

## Phase 7 — Dashboards

**Seller**
- Tabs: Leads (Direct / Market, hot tag = IMMEDIATE + BUSINESS/RESELLER), Orders, Demand Alerts.
- Market lead "Accept" reveals phone. Status updates (Contacted / Won / Lost).
- Source badge: "From Bzaro" / "From your store".
- Monthly summary card: leads, store visits via `ref=bzaro`, won value.

**Buyer**
- My Requirements (status: Sent → Viewed → Responded), My Orders with tracking, saved sellers, "Re-post requirement".

---

## Definition of done (every phase)

- `npm run build` passes, no TypeScript errors, lint clean.
- Zod validation on all inputs; auth + tenant checks on every server action/route.
- Rate limits on auth, OTP, requirement submit.
- Mobile layout checked at 360px.
- No buyer personal data in DemandAlert, logs, or client bundles.
- Migration tested on a copy of the DB before production.
- Commit per phase; note any env vars added.

---

## Not in scope yet

- SMS/phone OTP (schema ready via `phoneVerified`).
- WhatsApp Cloud API notifications (use `notifyLead` stub).
- Razorpay Route / commission model.
- Privacy Policy & Seller Terms content (draft separately, lawyer review).
