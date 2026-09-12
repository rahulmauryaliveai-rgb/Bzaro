# Security & Threat Model

What can go wrong on a platform that hosts thousands of third-party websites on
one domain, and what stops each thing.

---

## 1. Threat model

### 1.1 What we are protecting

| Asset                      | Why it matters                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Buyer enquiry data**     | Names, phones, emails of real buyers. The most sensitive data we hold, and regulated under India's DPDP Act. |
| **Seller KYC documents**   | GSTIN, PAN, address proof. Identity-theft grade.                                                             |
| **Cross-tenant boundary**  | One seller reading another's enquiries or catalogue is a business-ending breach of trust.                    |
| **Platform sessions**      | An admin session grants access to every tenant.                                                              |
| **Root domain reputation** | Shared by every seller. One SEO penalty or one phishing incident harms all 10,000.                           |
| **Payment integrity**      | Subscription state drives access to paid features.                                                           |

### 1.2 Adversaries

| #   | Adversary                      | Capability                                                                                                 | Primary goal                                                 |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A1  | **Malicious seller**           | Authenticated, owns a tenant, can upload images and write free text rendered on a `*.bzaro.in` host | Read other tenants' data; attack visitors; escalate to admin |
| A2  | **Anonymous internet**         | Unauthenticated HTTP, unlimited volume                                                                     | Scrape enquiries and contacts; spam; enumerate accounts; DoS |
| A3  | **Competitor / scraper**       | Anonymous or a cheap seller account                                                                        | Harvest the full seller + contact database                   |
| A4  | **Compromised seller account** | Credentials stolen via phishing or reuse                                                                   | Whatever that seller can do                                  |
| A5  | **Insider (platform staff)**   | An admin or support login                                                                                  | Bulk-export buyer data                                       |
| A6  | **Supply chain**               | A malicious or compromised npm package                                                                     | Exfiltrate secrets at build or runtime                       |

### 1.3 Trust boundaries

```
  Anonymous internet
        │
   ─────┼──────────  Cloudflare (WAF, rate limit, TLS)
        │
   ─────┼──────────  Proxy (edge)  ── string parsing only, no DB, no secrets
        │
   ─────┼──────────  RSC / Server Actions  ── auth + Zod validation happen HERE
        │
   ─────┼──────────  Service layer  ── business rules, tenant scoping
        │
   ─────┼──────────  Prisma (parameterised) ── + tenant-scoped extension
        │
      Postgres
```

Everything above the Server Action line is **untrusted input**, including
anything the proxy wrote into the path.

---

## 2. Threats and controls

### T1 — Cross-tenant data access `[Critical]`

**A1/A4 reads or modifies another seller's products, enquiries or settings.**

Three independent layers; see `docs/MULTI_TENANCY.md` §5 for detail.

1. `requireSellerAccess()` reads `SellerMember` from the database on every call
   — never from the token.
2. `forSeller()` injects `sellerId` into every read and stamps every write,
   throwing on a tenant mismatch rather than silently rewriting it.
3. ESLint blocks `import { db }` in `src/app/(dashboard)/**`.

**Verified by** `tests/e2e/tenant-isolation.spec.ts`.

### T2 — Cache-key collision serving tenant A's page on tenant B's host `[Critical]`

The highest-severity architectural failure available in this design, because it
leaks _rendered pages_ rather than query results, appears only under
concurrency, and no amount of query-level scoping prevents it.

**Control.** The tenant is encoded into the rewritten pathname, making it part
of the Next.js cache key by construction. Never a header, never a cookie, never
a module-level variable.

**Verified by** the concurrent-load test in the isolation suite.

### T3 — Stored XSS on a tenant site stealing platform sessions `[Critical]`

**A1 puts a script in a product description; a logged-in admin browses that
seller's site.**

If the session cookie were scoped to `.bzaro.in`, it would be transmitted
to _every_ subdomain, and one seller's XSS would harvest platform sessions.
`SameSite` does not help — all tenants are same-site.

**Controls:**

- **Host-only session cookie.** No `Domain` attribute; `__Host-` prefixed in
  production (which _forbids_ a `Domain`). The cookie is never sent to any
  tenant subdomain.
- **Dashboard and admin on the apex** (`/dashboard`, `/admin`), not on
  subdomains. This is why decision #7 matters structurally, not cosmetically.
- **Microsites are never authenticated.** No session read, no cookie, fully
  cacheable.
- `dangerouslySetInnerHTML` banned by ESLint across `src/**`.
- Theme tokens are Zod-constrained to hex colours and fixed enums, then emitted
  as individual CSS custom properties through React's style object — never
  concatenated into a `<style>` block.
- Templates are code (D7); sellers never supply markup.

**Verified by** the cookie assertions in the isolation suite, including that a
tenant page renders byte-identically with and without a session cookie.

### T4 — Enquiry harvesting `[High]`

**A3 scrapes buyer contact details at scale.** This is the platform's crown
jewels and its most likely real-world attack.

**Controls:** enquiry contact details are never rendered on public pages, only
inside the authenticated dashboard; per-IP rate limits; `enquiry:export` is a
distinct permission and every export is audit-logged; Cloudflare bot management.

**Phase 8 addition:** alert on anomalous export volume per account.

### T5 — Server Action invoked directly `[High]`

A Server Action is a POST endpoint. The layout that "protects" it in the UI
never runs for a crafted request.

**Control.** **Every Server Action authorises itself from scratch.** No action
trusts that a parent layout already checked. Layout guards are UX; action guards
are the security boundary.

`serverActions.allowedOrigins` includes `*.<root domain>` — required for the
microsite contact form, and a known trap: without it the form 403s silently in
the browser while passing every server-side test.

### T6 — Open redirect via the WhatsApp tracker `[Medium]`

`/api/wa` logs a click then forwards to `wa.me`. Unsigned, it would let anyone
bounce victims anywhere using the platform's domain reputation.

**Control.** The redirect target is derived server-side from `sellerId`, never
from a caller-supplied URL, and the request carries an HMAC signature. The
handler forwards only to `https://wa.me/`.

### T7 — Malicious file upload `[Medium]`

**Controls:** browser uploads go **directly** to the CDN using server-signed
parameters that pin the folder to `sellers/{sellerId}/`, restrict format, and
cap size, expiring in 60 seconds. The database row is written by a signed
confirm callback — a client-reported URL is never trusted. Bytes never pass
through the Next.js server. Image moderation runs before public display (D10).

### T8 — Account enumeration and credential stuffing `[Medium]`

**Controls:** uniform failure response for every login rejection path (no such
user, wrong password, locked, inactive are indistinguishable); Argon2id;
per-account lockout after 10 failures for 15 minutes; per-IP rate limit;
timing-safe verification.

### T9 — Privilege escalation `[High]`

**Controls:** `admin:user:role` is granted only to `SUPER_ADMIN` — deliberately
withheld from `ADMIN`, along with `admin:seller:delete` and
`admin:settings:manage`. All role checks resolve through the single matrix in
`src/lib/auth/permissions.ts`. Role changes must bump `sessionsInvalidAfter`
(see §3).

### T10 — Subdomain takeover / impersonation `[Medium]`

**A1 registers `login`, `admin`, or `hdfc-bank` as a slug and phishes users on a
`bzaro.in` subdomain.**

**Controls:** the three-class denylist in `src/lib/tenant/reserved.ts`
(infrastructure, platform surfaces, brand-protected); punycode rejected
(homograph attacks); retired slugs never reclaimable (D11), so a new seller
cannot inherit another business's reputation.

### T11 — Root-domain SEO penalty `[High, existential]`

Thousands of auto-generated near-empty subdomains is the textbook doorway-page
pattern, and the penalty attaches to the root domain — every seller at once.

**Control.** The configurable index-eligibility gate (D2). See `docs/SEO.md`.

### T12 — Webhook replay / forgery `[Medium]`

**Controls:** signature verification on every gateway webhook; a
`WebhookEvent` table with `@@unique([provider, eventId])` making replays
provable no-ops; subscription state changes are idempotent.

### T13 — Denial of service via unbounded input `[Medium]`

**Control.** Every Zod schema sets explicit string-length, array-length and
payload caps. An unbounded `String[]` is a cheap DoS: a 10 MB "tags" array costs
nothing to send and a great deal to validate, log and store.
`serverActions.bodySizeLimit` is 2 MB.

### T14 — Secret leakage `[High]`

**Controls:** `src/env.ts` imports `server-only`, so an accidental client import
is a build error rather than a leaked secret; the public/server split is
enforced by two separate modules; ESLint bans `process.env` outside those two
files; `.env*` is git-ignored except `.env.example`.

### T15 — Insider bulk export `[Medium]`

**Controls:** `enquiry:export` is a separate permission; `AuditLog` records
actor, action, entity and hashed IP; `SUPPORT` is read-only.

**Gap:** admin reads are not yet audit-logged, only writes. Closed in Phase 8.

---

## 3. Sessions

Decision D19 explains why sessions are JWT-backed rather than database-backed:
Auth.js cannot combine the Credentials provider with database sessions, and
email/password login is a hard requirement.

The revocation property is restored explicitly.

### `User.sessionsInvalidAfter`

A timestamp. Any token issued before it is rejected on its next request.

**This column MUST be set on every privilege-reducing operation:**

| Operation                     | Required         |
| ----------------------------- | ---------------- |
| Suspend or ban a user         | ✅               |
| Suspend or ban a seller       | ✅ (all members) |
| Change a user's role          | ✅               |
| Password reset or change      | ✅               |
| Remove a member from a seller | ✅               |
| "Sign out everywhere"         | ✅               |
| Email change                  | ✅               |

Forgetting it means the change lags by up to five minutes. That is the one
sharp edge of D19, and it is why the list above exists.

### Periodic re-validation

The `jwt` callback re-reads the user every 300 seconds and returns `null` —
signing them out immediately — if the account is inactive or deleted.

### Cookie

`__Host-authjs.session-token` in production: `Secure`, `Path=/`, **no `Domain`**.
The `__Host-` prefix makes the absence of `Domain` enforceable by the browser,
so a future misconfiguration cannot silently widen the scope.

---

## 4. Input validation

Zod at every trust boundary. Schemas live in `src/lib/validation/` and are shared
between client form and Server Action so the rules cannot drift. Server-side
validation is authoritative; client-side is a UX affordance.

Password policy follows NIST SP 800-63B: length over composition. Mandatory
symbol and digit rules push users toward predictable patterns (`Password1!`)
without adding real entropy.

---

## 5. Rate limiting

Two layers. Cloudflare WAF at the edge stops volumetric abuse before it costs a
function invocation; `src/lib/ratelimit.ts` applies precise per-action limits.

| Action         | Limit     | Keyed by                      |
| -------------- | --------- | ----------------------------- |
| Enquiry submit | 5 / hour  | IP                            |
| Login          | 10 / hour | IP                            |
| Phone OTP      | 3 / hour  | phone (each costs real money) |
| Upload signing | 30 / hour | seller                        |
| Search         | 60 / min  | IP                            |
| Registration   | 5 / hour  | IP                            |
| Password reset | 5 / hour  | IP                            |

**Fails open on infrastructure error.** If Redis is unreachable, a working
marketplace with no rate limiting beats a marketplace that rejects every
enquiry. Deliberate — and monitored: a spike in these errors should page
someone.

**Production requires Upstash.** The in-memory fallback is per-process and
therefore useless across serverless instances; `ratelimit.ts` throws at boot in
production if credentials are missing, rather than silently providing no
protection.

---

## 6. PII handling

- **IP addresses are never stored raw.** Hashed with a rotating salt
  (`IP_HASH_SALT`, rotated quarterly) before touching the database.
- **KYC documents** live in a private bucket, are served only via short-lived
  signed URLs, are admin-only, and are never CDN-served.
- **India's DPDP Act** applies to buyer contact data: consent text at the point
  of enquiry, and a deletion path.
- Enquiry attribution fields (`userAgent`, `referrer`, `landingPath`) are not
  exposed in the seller UI.

---

## 7. SQL injection

Prisma parameterises every query. The only raw SQL is full-text search, which
uses `Prisma.sql` tagged templates — **never** string concatenation. The
`create_analytics_partition` function uses `format()` with `%I`/`%L`
placeholders, and is called only with server-generated dates.

---

## 8. Response headers

Applied in `next.config.ts`:

| Header                      | Value                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                                                                                               |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                       |
| `Permissions-Policy`        | camera, microphone, geolocation all denied                                                                              |
| `X-Frame-Options`           | `SAMEORIGIN` — a seller site inside an attacker's iframe is a clickjacking surface against that seller's customers      |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (production)                                                             |
| `X-Robots-Tag`              | `noindex, nofollow` on `/dashboard` and `/admin`                                                                        |
| `Cache-Control`             | `private, no-store` on `/dashboard` and `/admin` — a shared cache holding one seller's dashboard is a cross-tenant leak |

**Not yet applied:** a nonce-based Content-Security-Policy. It requires
generating a per-request nonce in the proxy, which interacts badly with caching
static HTML and must be done carefully rather than bolted on. **Phase 10.**

---

## 9. Known advisories

`npm audit` reports 4 high-severity advisories. All arrive through
`@prisma/client`, which depends on the `prisma` CLI package:

| Package        | Advisory                                         | Reachable?                                                                                                     |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `mysql2`       | Auth plugin downgrade; zlib decompression bomb   | **No.** We are Postgres-only via `@prisma/adapter-pg`. The MySQL driver is never loaded.                       |
| `deepmerge-ts` | Stack exhaustion merging recursive object graphs | **No.** Reached only by `@prisma/config` when loading `prisma7.config.ts` at build time, with input we author. |

Neither is exploitable in this application's runtime. `npm audit fix --force`
would downgrade or break Prisma. **Re-evaluate on each Prisma upgrade** — the
correct fix is upstream.

---

## 10. Security checklist by phase

**Phase 0 (done)**

- [x] Host-only session cookies, dashboard and admin on the apex
- [x] Tenant-scoped Prisma client + ESLint boundary
- [x] Permission matrix in one auditable file
- [x] Zod validation with explicit caps
- [x] Rate limiter with production hard-fail
- [x] Reserved subdomain denylist + DB CHECK constraint
- [x] Env validation with `server-only` enforcement
- [x] Security headers
- [x] Tenant-isolation test suite

**Phase 2 (auth)**

- [ ] Set `sessionsInvalidAfter` on every operation in §3's table
- [ ] Email verification before publishing
- [ ] Re-authentication for email, password and domain changes

**Phase 3 (uploads)**

- [ ] Signed direct uploads with folder, format and size pinning
- [ ] Signed confirm callback; never trust a client-reported URL

**Phase 6 (enquiries)**

- [ ] Turnstile + honeypot + timing heuristics
- [ ] Consent text at the point of enquiry (DPDP)

**Phase 8 (admin)**

- [ ] Audit-log admin **reads**, not only writes
- [ ] Anomalous-export alerting
- [ ] KYC documents on signed URLs only

**Phase 10 (hardening)**

- [ ] Nonce-based CSP
- [ ] Optional Postgres RLS
- [ ] Rehearsed backup restore drill
- [ ] Penetration test before public launch
