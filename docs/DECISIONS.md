# Architecture Decision Records

Every decision that shapes the schema, the routing, or the security model. Each
record states the decision, why it was made, what it costs, and what would make
us revisit it.

**Status legend:** `Accepted` · `Superseded` · `Revisit at <trigger>`

| #                                                   | Decision                                              | Status                              | Phase |
| --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- | ----- |
| [D1](#d1--microsite-is-canonical)                   | Microsite is canonical for seller content             | Revised by D32                      | 7     |
| [D2](#d2--configurable-index-eligibility)           | Configurable index eligibility, noindex by default    | Accepted                            | 0     |
| [D3](#d3--custom-domains-deferred-designed-for-now) | Custom domains deferred to Phase 10, designed for now | Accepted                            | 10    |
| [D4](#d4--postgresql-full-text-search-first)        | PostgreSQL FTS first, behind a provider interface     | Accepted                            | 5     |
| [D5](#d5--free-leads-paid-visibility)               | Free leads, paid visibility                           | Accepted                            | 9     |
| [D6](#d6--india-first-razorpay)                     | India first, Razorpay, behind an abstraction          | Accepted                            | 9     |
| [D7](#d7--code-registered-website-templates)        | Code-registered website templates                     | Accepted                            | 0     |
| [D8](#d8--seller-verification-state-machine)        | Seller verification state machine                     | Accepted                            | 8     |
| [D9](#d9--english-only-v1-schema-kept-translatable) | English-only v1, schema kept translatable             | Accepted                            | —     |
| [D10](#d10--moderation-before-public-launch)        | Moderation queue before public launch                 | Accepted                            | 8     |
| [D11](#d11--slug-changes-preserve-old-urls-forever) | Slug changes preserve old URLs forever                | Accepted                            | 0     |
| [D12](#d12--reserved-subdomain-denylist)            | Reserved subdomain denylist                           | Accepted                            | 0     |
| [D19](#d19--jwt-sessions-with-explicit-revocation)  | JWT sessions with explicit revocation                 | **Accepted (revises approved #3)**  | 0     |
| [D20](#d20--tenant-path-segment-is-site-not-_sites) | Tenant path segment is `/site/`, not `/_sites/`       | **Accepted (revises approved #10)** | 0     |
| [D21](#d21--per-surface-root-layouts)               | Per-surface root layouts                              | Accepted                            | 0     |
| [D22](#d22--analytics-partitioned-from-day-one)     | AnalyticsEvent partitioned from day one               | Accepted                            | 0     |
| [D23](#d23--prisma-7-with-a-driver-adapter)         | Prisma 7 with an explicit `pg` driver adapter         | Accepted                            | 0     |
| [D28](#d28--buyers-are-phone-first-identities-not-users) | Buyers are phone-first identities, not users          | Accepted                            | L1    |
| [D29](#d29--market-fan-out-is-a-database-polled-outbox-not-a-queue) | Market fan-out is a DB-polled outbox, not a queue     | Accepted                            | L3    |
| [D30](#d30--a-guarded-root-level-city-segment-for-discovery-pages) | Guarded root-level `[city]` segment for discovery  | Accepted                            | L5    |
| [D31](#d31--the-proxy-resolves-a-loopback-host-through-x-forwarded-host) | Proxy resolves loopback Host via `x-forwarded-host`  | Accepted                            | L6    |
| [D32](#d32--web-presence-is-a-plan-tier)            | Web presence is a plan tier: catalogue → subdomain → custom domain | Accepted               | L7    |
| [D33](#d33--storefront-templates-are-compositions-of-shared-sections) | Storefront templates are compositions of shared sections | Accepted           | L8    |
| [D34](#d34--indiamart-style-category-tree-chosen-at-registration) | IndiaMART-style category tree, chosen at registration | Accepted               | L8    |

---

## Two records revise decisions you approved

Both were approved in good faith and then hit a hard constraint during Phase 0
implementation. Neither is a preference change; in both cases the approved
option does not work as specified.

### D19 — JWT sessions with explicit revocation

**Revises approved decision #3** ("Database sessions rather than JWT if you
believe this is the safer choice").

**Constraint.** Auth.js v5 cannot combine the Credentials provider with database
sessions. The Credentials provider only issues JWT sessions; this is a framework
limitation, not a configuration option. Email/password login is a hard
requirement for the Indian B2B market, so the choice is between dropping
password login or dropping database sessions.

**Decision.** JWT sessions, with the revocation property restored explicitly:

1. **`User.sessionsInvalidAfter`** — a timestamp. Any token issued before it is
   rejected on its next request. Set on suspend, ban, role change, password
   reset, and "sign out everywhere". This gives _immediate_ revocation, which is
   the property database sessions were wanted for.
2. **Periodic re-validation** — the `jwt` callback re-reads the user from the
   database every 300 seconds and drops the session if the account is inactive
   or deleted. Role changes land within five minutes.

**Cost.** A role _downgrade_ can lag up to five minutes unless the code path
also bumps `sessionsInvalidAfter`. Every privilege-reducing operation must set
it. That is a rule the code enforces, not a hope — see `docs/SECURITY.md`.

**Net.** Equal security to database sessions for the cases that matter
(suspension, ban, password reset), at roughly 1/60th of the database load,
because there is no session lookup on every request.

**Revisit if** Auth.js gains database-session support for credentials, or if we
drop password login in favour of OTP-only.

---

### D20 — Tenant path segment is `/site/`, not `/_sites/`

**Revises approved decision #10** ("Tenant routes using `/_sites/{slug}/...`
internally").

**Constraint.** In the Next.js App Router, a folder whose name begins with an
underscore is a **private folder**: it and all its children are opted out of
routing entirely. `app/(site)/_sites/[tenant]/page.tsx` therefore does not
create a route. The failure is silent — the app builds, and every tenant
hostname 404s.

This was caught by the Phase 0 build (the route was simply absent from the
route manifest), not by a runtime error.

**Decision.** The internal segment is `/site/{slug}/...`.

**Consequence and its mitigation.** Because the segment is now public, every
microsite would also be reachable at `bzaro.in/site/<slug>` — duplicating
the entire catalogue and undermining D1. The proxy therefore returns 404 for any
apex request to `/site/*`. This is asserted by
`tests/e2e/tenant-isolation.spec.ts` ("the internal `/site/` segment 404s on the
apex").

**Alternatives rejected.**

- `app/(site)/[tenant]/` at the root — a root-level dynamic segment would catch
  every unmatched apex path, so `bzaro.in/anything` could render a tenant
  site. Far more dangerous than a guarded prefix.
- A rewrite header instead of a path — reintroduces the cache-key collision this
  architecture exists to prevent (see `docs/MULTI_TENANCY.md`).

**Revisit if** Next.js changes private-folder semantics.

---

## D1 — Microsite is canonical

**Decision.** The seller's subdomain owns product, service, about and gallery
content. Marketplace product pages carry `rel="canonical"` pointing at the
subdomain. The marketplace stays canonical for the discovery surfaces it
uniquely owns: search, category, location, seller directory.

**Why.** Sellers must get real, defensible SEO value from their microsite —
that is the product's differentiator against a plain directory. Pooling all
authority on the apex would make seller sites decorative.

**Cost.** Link equity spreads across subdomains, which search engines treat as
partially separate sites. Accepted deliberately, and the reason D2 exists.

**Revisit if** Search Console shows subdomains failing to rank after 6 months of
indexed, complete sites.

**Revised by D32.** "Microsite" now means "the seller's highest available
surface". A seller whose plan has no website is canonical on the marketplace.

## D2 — Configurable index eligibility

**Decision.** A microsite serves `noindex, follow` until it clears a
**configurable** eligibility bar. Rules live in the `Setting` table under
`index_eligibility`, are validated by Zod, and are tunable from the admin
dashboard without a deploy.

Default requirements: verified seller, verified phone, active (not suspended),
published website, business name, description ≥ 150 characters, logo or cover
image, location, a contact method, an address, and either ≥ 3 published products
or ≥ 2 published services — plus a profile score ≥ 60.

**Why configurable.** These thresholds are an SEO hypothesis, not a fact. The
first time Search Console reports thin content, the right response is to raise
the bar that afternoon. If instead the bar is gatekeeping legitimate small
sellers, it must come down just as fast. Neither should require a release.

**Why persisted.** `SellerWebsite.indexable` is computed in the write path and
stored, so `robots.txt` and `generateMetadata` read one boolean column instead of
running a multi-table scoring query on every crawler request.

**Implementation.** Pure evaluation in `src/lib/validation/index-eligibility.ts`
(unit-tested, no database); I/O in
`src/server/services/indexability.service.ts`.

**Cost.** New sellers are invisible to search engines until they complete their
profile. Explicitly approved. The dashboard must therefore present the unmet
requirements as a checklist, not a mystery.

## D3 — Custom domains deferred, designed for now

**Decision.** No custom domains in v1. Ship in Phase 10 behind a plan flag. But
tenant resolution keys on **hostname generically** from day one — never on "the
subdomain label" — and `SellerWebsite` already carries `customDomain`,
`customDomainStatus`, `customDomainVerifiedAt`, `domainVerifyToken`.

**Why now.** Retrofitting would mean reworking tenant resolution, TLS
provisioning and the canonical model simultaneously. Designing for it costs one
extra branch in the proxy (`host:` prefix) and four nullable columns.

See `docs/MULTI_TENANCY.md` §Future custom domains for the full flow.

## D4 — PostgreSQL full-text search first

**Decision.** Postgres `tsvector` generated columns with GIN indexes, plus
`pg_trgm` for fuzzy matching. Behind a `SearchProvider` interface in
`lib/search/`.

**Why.** One less system to run, transactional consistency with the catalogue,
no sync lag, no additional cost. At 10,000 sellers this is comfortably
sufficient.

**Revisit at** any of: >1M indexed documents, p95 search latency >300 ms, or
faceting across >6 dimensions. Then migrate to Typesense or Meilisearch — one
file changes.

## D5 — Free leads, paid visibility

**Decision.** Enquiries are free and unmetered for all sellers, including the
free plan. Revenue comes from premium plans, featured listings, featured
products, premium templates, analytics, and later promoted listings.

**Schema hedge.** `Plan.leadCreditsPerMonth`, `Subscription.leadCreditsUsed` and
`Enquiry.unlockedAt` exist now and are unused. Switching to metered leads later
is a feature flag plus masking logic — never a migration.

**Revised by D28 (2026-09-17).** The hedge paid off half-way. Enquiries and
DIRECT leads — a buyer contacting a seller they chose — remain free and
unmetered on every plan. MARKET leads — the platform forwarding that buyer's
requirement to other matched sellers — cost one credit to accept, granted
monthly per plan via `Plan.leadCreditsPerMonth` (Free 0, Basic 10, Gold 40).
`Subscription.leadCreditsUsed` is superseded by the `CreditLedger` and is no
longer written. See docs/LEADS.md.

## D6 — India first, Razorpay

**Decision.** INR, Razorpay (UPI, netbanking, cards, e-mandates). Behind
`lib/billing/PaymentProvider` so Stripe can be added without touching
subscription logic.

**Non-negotiables regardless of provider:** signature-verified webhooks, a
`WebhookEvent` dedupe table making replays provable no-ops, GST-compliant
invoice numbering, and an explicit grace-period policy.

## D7 — Code-registered website templates

**Decision.** Templates are React components in a typed registry
(`src/components/site/templates/registry.ts`). A `WebsiteTemplate` row stores a
`key` that selects one. Sellers pick a template and tune Zod-validated design
tokens; they never supply markup or CSS.

**Why.** User-authored HTML needs sanitisation, sandboxing, a rendering engine
and template versioning — a product in itself — and turns every seller into a
potential XSS vector against their own customers.

**Consequence.** Switching templates is a settings change, never a data
migration: every template consumes the identical `TenantContext`.

## D8 — Seller verification state machine

```
DRAFT → PENDING_VERIFICATION → VERIFIED
             ↓                      ↓
          REJECTED             SUSPENDED → BANNED
```

Documents (GSTIN, PAN, business registration, address proof) are stored as
`SellerDocument` in a **private bucket**, served only through short-lived signed
URLs, admin-only, every access audit-logged. They are never public and never
CDN-served.

## D9 — English-only v1, schema kept translatable

`locale` exists on `Seller` and `AnalyticsEvent`. The router does not hard-code
`/` as the locale root. Translatable content stays in named columns rather than
JSON blobs, so a future `ProductTranslation` table is a clean join.

## D10 — Moderation before public launch

Image moderation (Cloudinary AI or Rekognition), a text blocklist, a public
"report listing" path, and an admin queue. `Product.moderationStatus` and
`GalleryItem.moderationStatus` default to `PENDING` for new sellers and
auto-approve for sellers with clean history.

**Implemented** in `src/lib/validation/moderation.ts` (pure and unit-tested,
in the same spirit as the D2 eligibility rules). "Clean history" means: the
business is VERIFIED, nothing of theirs has ever been rejected or flagged, and
at least one item has already cleared review. So a seller's FIRST listing is
always reviewed, and everything after it is immediate.

The asymmetry is deliberate: earning trust needs several signals to line up,
losing it needs one. A wrongly-trusted spam listing is paid for by every buyer
who sees it; a wrongly-untrusted seller waits one review cycle.

**Edits re-review too**, for sellers who have not earned trust. Without that,
moderation is bypassed in three steps: publish something innocuous, wait for
approval, edit it into anything at all.

**What the seller sees matters as much as the rule.** The create form says a
listing will be reviewed BEFORE the seller writes anything — finding out
afterwards reads as a rejection, knowing in advance reads as a process — and
the catalogue list shows "Awaiting review" rather than "Published", because an
item that is published but unapproved is live to nobody.

Pre-moderating everything does not survive 10,000 sellers with one founder;
post-moderating everything means the first spam listing is public before anyone
sees it. Earning trust once is the middle path.

## D11 — Slug changes preserve old URLs forever

A seller may change their slug once per 90 days. The old slug is written to
`SellerSlugHistory` and **never deleted**. Requests to a retired subdomain
return a permanent redirect to the current one.

**Why forever.** Inbound links and accumulated ranking attach to the old
hostname. Reclaiming the slug later would also let a different seller inherit
another business's reputation — a real impersonation risk.

## D12 — Reserved subdomain denylist

`src/lib/tenant/reserved.ts` blocks three classes of label:

- **Infrastructure** (`www`, `api`, `mail`, `cdn`, `ns1`…) — squatting these
  shadows a platform service for every tenant.
- **Platform surfaces** (`admin`, `login`, `billing`, `support`…) — a phishing
  vector against the platform's own users.
- **Brand-protected** terms.

Also rejected: dots (a wildcard certificate covers exactly one label, so
`a.b.bzaro.in` has no valid certificate), punycode `xn--` prefixes
(homograph attacks against other tenants), and RFC 5891 reserved hyphen
positions.

Enforced in three places: this module, the Zod schema, and the
`Seller_slug_format` CHECK constraint in the database.

## D21 — Per-surface root layouts

**Decision.** No shared `app/layout.tsx`. Each route group —
`(marketplace)`, `(site)`, `(dashboard)`, `(admin)`, `(auth)` — owns its own root
layout with its own `<html>`.

**Why.** A microsite must set `lang` from the seller's locale and inject that
seller's theme tokens onto `<html>`; the dashboard is a private application
shell with `noindex` and `no-store`. A single shared root layout would force
every surface to carry the others' baggage and could not vary `<html>` per
tenant.

## D22 — AnalyticsEvent partitioned from day one

**Decision.** `AnalyticsEvent` is a Postgres range-partitioned table
(monthly, on `createdAt`) created that way in the initial migration.

**Why now.** At 10,000 sellers × 100 events/day this reaches ~365M rows/year.
Converting a large populated table to a partitioned one requires downtime;
doing it while the table is empty costs nothing.

**Consequence.** The primary key is composite (`id`, `createdAt`) — Postgres
requires the partition key in every unique constraint on a partitioned table.
A `create_analytics_partition(date)` function plus a `DEFAULT` partition means a
missed cron run degrades to "rows land in the default partition", never to
"writes fail".

## D23 — Prisma 7 with a driver adapter

**Decision.** Prisma 7.10, `prisma-client` generator, `@prisma/adapter-pg` over
an explicitly configured `pg.Pool`.

**Notes for future maintainers:**

- npm's `latest` tag for `prisma` currently points at an **8.0.0 release
  candidate**. Both `prisma` and `@prisma/client` are pinned to 7.10.0. Do not
  run `npm i prisma@latest` without reading the major-version guide.
- Prisma 7 removed `directUrl` from the datasource block. The pooled/direct
  split is therefore: the app uses `DATABASE_URL` via the adapter in
  `src/lib/db.ts`; `prisma migrate` uses `DIRECT_DATABASE_URL` via
  `prisma7.config.ts`.
- Owning the `pg.Pool` directly is a benefit: pool size, idle timeout and
  connection timeout are explicit rather than framework defaults.
- `@prisma/client` depends on the `prisma` CLI, which drags `mysql2` and
  `deepmerge-ts` advisories into the dependency tree. Neither is reachable at
  runtime (we are Postgres-only; the config path runs at build time). Tracked in
  `docs/SECURITY.md` §Known advisories.

## D24 — Local database: Docker or hosted, not `prisma dev`

**Decision.** `docker compose up -d` (or a free hosted Postgres such as Neon) is
the recommended local database. `prisma dev` is a documented fallback for
machines without Docker, not the default.

**Why.** `prisma dev` was used to build Phases 0–9 and proved unreliable in
practice: across the build its server stopped accepting connections **nine**
separate times, each producing `Connection terminated unexpectedly` on every
query and a `503` from `/api/health`.

Cached pages kept serving throughout, which makes the failure especially
confusing: the site looks healthy while every uncached path 500s.

**Root cause (identified in Phase 9).** `prisma dev` is not a Postgres service.
It is **PGlite — Postgres compiled into the Node process itself**. The database
has no life independent of that process, so anything that kills the process
kills the database, and the lock files it holds are left behind pointing at a
PID that no longer exists.

The next start then fails with `Lock file is already being held`, naming a
holder that is gone. `prisma dev stop` cannot clear it — there is nothing left
to stop — so the command that looks like the fix is the one command guaranteed
not to work. The locks come in two shapes, `server.lock` (a file) and
`server.lock.lock` (a *directory*), under
`%LOCALAPPDATA%\prisma-dev-nodejs\Data\`.

This is also why an embedded database is the wrong default for a project whose
test suite starts and stops a production server: every abrupt shutdown is a
potential corruption of the dev loop.

**Mitigation.** `npm run db:start` now runs `scripts/db-start.mjs` rather than
the raw command. It clears locks orphaned by a dead process — gated on a TCP
liveness probe, so a *running* server is never unlocked — re-syncs the port in
`.env.local`, and refuses to report success until it has executed a real query.
A dead database now fails on the line that started it instead of thirty seconds
into a test run. The raw command remains available as `db:start:raw`.

This makes `prisma dev` survivable; it does not make it the recommended choice.
Docker remains the default.

**Consequence: reads now retry a dropped connection.** `src/lib/db-retry.ts`
classifies connection failures and `src/lib/db.ts` retries them twice, with a
short backoff, for READ operations and raw reads only. Writes are never
retried: when a query fails with "the server closed the connection" there is no
way to tell whether it ran first, so repeating a `create` risks inserting the
row twice.

This is not a workaround for PGlite. Everything between the app and Postgres
recycles idle connections on its own schedule — PgBouncer, every managed
Postgres proxy — so a pool handing out an already-closed socket is an expected
condition in production too, and a visitor should never meet a crash page
because of it. A database that is genuinely down still fails, about 300ms later.

**Classify on the CODE, not just the message.** The first version of this
checked only `error.message`, and missed every socket-level failure: Prisma
reports those as "Invalid `prisma.$queryRaw()` invocation:" with the real cause
on `error.code` (`ECONNREFUSED` and friends). `/search` went on returning 500
with the retry supposedly in place. There is a regression test for exactly that
shape.

**Consequence for the pool.** This surfaced a genuine gap that was worth fixing
regardless of which database you run: `src/lib/db.ts` now sets
`idleTimeoutMillis` **below** the typical proxy idle timeout, enables
`keepAlive`, and attaches a `pool.on("error")` handler.

Without that handler an idle client error is an unhandled `error` event, which
terminates the Node process. PgBouncer and every managed Postgres proxy drop
idle connections on their own schedule too — so this hardening matters in
production, not only locally.

**If you use `prisma dev` anyway:** its storage has not proven durable across
restarts. Treat `npm run db:deploy && npm run db:seed` as a routine step, not an
exceptional one, and start it only through `npm run db:start`.

**The end-to-end suite runs with one worker because of this.** Several
Playwright workers hitting one PGlite server reliably killed it part-way
through a run, surfacing as one or two unrelated-looking failures every time —
traced each time to `ConnectionClosed`, never to the code under test. Serially
the same suite passes end to end, for about twenty seconds more. The setting
lives in `playwright.config.ts` and should be raised once the local database is
Postgres in Docker: the suite has no shared-state reason to be serial.

---

## D25 — Session cookie security follows the scheme, not `NODE_ENV`

**Decision.** `secure` on the session cookie, and the `__Host-` prefix that
depends on it, are derived from whether `AUTH_URL` is `https://`. When
`AUTH_URL` is absent the rule falls back to `NODE_ENV === "production"`, so a
misconfigured deploy still fails closed.

**Why.** The original rule keyed both on `NODE_ENV` alone. That is the wrong
input: a `Secure` cookie is never sent over plain HTTP, so a production build
served over `http` issues a session cookie the client then refuses to send back.
Every authenticated request bounces to the login page, and nothing in the logs
says why — the sign-in itself succeeds.

This is not hypothetical. The e2e suite deliberately runs against a production
build (an earlier bug was invisible in dev), over `http://lvh.me:3000`. Under
the old rule every authenticated journey was untestable, which is precisely why
seller onboarding had no end-to-end coverage until now.

Real deployments set an `https` `AUTH_URL` and are unaffected. A deployment
serving plain HTTP has no TLS to protect the cookie anyway, so honouring the
declared scheme is strictly more accurate than guessing from the build mode.

---

## D26 — `ALLOW_INSECURE_RATE_LIMIT` for production builds under test

**Decision.** The rate limiter still refuses to fall back to its in-memory
implementation under `NODE_ENV=production` (D-level hardening, unchanged), with
one explicit opt-out: `ALLOW_INSECURE_RATE_LIMIT=1`. It warns once per process
when used, and is set only by `playwright.config.ts` for the test server.

**Why.** The guard is right — an in-memory limiter is per-instance and protects
nothing across serverless instances, so silently using one in production is the
outcome most worth preventing. But it made every rate-limited action return 500
in a production build without Redis, which is exactly how the suite runs. The
registration journey could not be tested at all.

The escape hatch is deliberately named so it cannot be mistaken for a tuning
knob or set by accident, and it announces itself in the logs every time it is
used. Requiring a live Redis to run the test suite would have been the more
likely path to the guard being deleted outright.

---

## D27 — Direct signed uploads, with a local provider for development

**Decision.** Image bytes go from the browser straight to the CDN. The
application server issues a short-lived signature and later verifies the result;
it never receives, buffers or forwards a file. `MediaProvider`
(`src/lib/media/types.ts`) is the seam, with a Cloudinary implementation for
real deployments and a local disk implementation for development.

**Why direct.** On a per-invocation platform, proxying a 5 MB photograph through
a function costs memory, execution time and bandwidth on every upload and gives
nothing back — the CDN is better at receiving files than we are. It is also the
difference between an upload that works on a slow phone connection and one that
times out at the function's request limit.

**What the signature actually does.** Cloudinary rejects any parameter the
client adds that the signature does not cover. So signing `folder`, `public_id`
and `allowed_formats` does not merely *suggest* those values — it makes them the
only ones the upload can use. The folder is derived from the seller id on the
server and never read from the request, which is what stops one tenant writing
into another's folder.

**Why the result is verified rather than believed.** After the upload the
browser reports what happened, and that report is attacker-controlled: a caller
can invent a URL, a size, or another seller's public id and post it back.
`verifyUpload` therefore re-checks three things — Cloudinary's own signature over
the response, that the public id sits inside this seller's folder, and that the
URL is on our cloud. Skipping this step would reduce "signed direct upload" to
"a client-supplied URL with extra steps", and would let any seller put an
arbitrary host into an `<img src>` on a public page.

**Why a local provider exists.** Nobody should need a Cloudinary account to run
this project, and a catalogue you cannot put a photograph into is a catalogue
you cannot really test — the same reasoning as `ConsoleMailProvider`. It
deliberately breaks the no-proxy rule by writing to `public/uploads`, which is
why it is refused outright in production, where that filesystem is ephemeral and
writing to it would appear to work and then silently lose every image.

It is still *signed*, with a real HMAC checked by the receiving route. Not
because a laptop is under attack, but because an unsigned development path lets
the two flows diverge — and the flow that never gets exercised is the one that
breaks on launch day. Both providers hand the client the same shape and verify
the same way.

**Pasting a link still works.** Uploads are an enhancement over a form that
already accepted a URL. A seller whose photographs already live on their old
website should not have to download and re-upload them, and a deployment without
Cloudinary should degrade to something usable rather than to a broken button.
A pasted link is stored with an empty `publicId`, which is how the two origins
stay distinguishable: a row with a public id is ours and can be deleted from the
CDN, a row without one is hosted somewhere we do not control.

---

## D28 — Buyers are phone-first identities, not users

**Decision.** A buyer is a verified phone number (`Buyer.phone`, E.164), created
the moment an OTP is confirmed. No password, no email, no Auth.js session.
A signed, host-only cookie (`bz_buyer`) carrying only the buyer id lets a
returning buyer skip the OTP for thirty days. `Buyer.userId` is an optional
link for the day a buyer wants a real account.

**Why.** The buyer's entire job is "tell this supplier what I want and open
WhatsApp". Every field between the click and the wa.me link is a buyer who
leaves. A phone number is the one thing the seller needs and the one thing
the buyer will type; asking for anything more before the lead exists is
optimising for our data model over the conversion. It is also the identity
IndiaMART trained this market to expect.

**Why not the User table.** `User` is the Auth.js account with roles, sessions
and a permission matrix. A buyer needs none of it, and mixing the two makes
every seller-dashboard query that starts from `User` carry a "but not buyers"
filter forever. The `BUYER` role stays in the enum for a buyer who does
register.

**OTP storage.** `tokens.ts` stores plain SHA-256 because its tokens are 256
bits of CSPRNG output. A six-digit code is a million candidates, so a plain
hash in a dump *is* the code. `OtpChallenge.codeHash` is therefore an HMAC
keyed by `OTP_PEPPER`, which lives only in the server environment. Three
attempts per code, five-minute expiry, single use, plus per-phone and per-IP
rate limits in front.

**Cost.** The buyer cookie is host-only, exactly like the session cookie and
for the same reason (any seller's stored XSS on a tenant subdomain must not
read it). So a buyer verified on the marketplace is *not* recognised on a
microsite and will see the OTP again there. Accepted: the code takes thirty
seconds, and the alternative is a cookie every tenant can read.

**Revisit at** the first buyer feature that needs state beyond "I want X" —
saved suppliers, a requirement history page. That is when `Buyer.userId`
starts being populated.

---

## D29 — Market fan-out is a database-polled outbox, not a queue

**Decision.** The request that creates a `Requirement` writes it with
`fanoutStatus = PENDING` and returns. A separate PM2 process (`bzaro-worker`)
polls with `SELECT … FOR UPDATE SKIP LOCKED`, runs the matcher, inserts the
MARKET leads and their `LeadDelivery` rows, and drains those through the
`LeadNotifier`. Partial indexes on the PENDING rows keep the poll cheap at any
table size.

**Why not BullMQ.** The VPS has Redis, but the application reaches it only
through SRH's HTTP shim (`ratelimit.ts` speaks Upstash's REST protocol).
BullMQ needs a raw TCP client, which means a new dependency, a new password
in the environment, a second Redis access path to secure, and — because
BullMQ's jobs are not in the same database as the rows they act on — a
two-phase-commit problem the moment a job runs before its transaction
commits. The outbox pattern has none of that: the fan-out is a row in the
same transaction as the requirement, so it is exactly-once by construction.

**Why not inline.** Matching touches every seller in a category and writes
up to ten leads with deliveries. That is fine at 200 ms; it is not fine on the
critical path of a buyer waiting for a wa.me link, and it must not fail the
DIRECT lead if the matcher throws.

**Cost.** Latency of one poll interval (seconds) before MARKET leads appear,
which nobody is waiting for. A second process to run and monitor — the same
`pm2` unit, one more line in `ecosystem.config.js`.

**Revisit at** ~10 requirements per second sustained, where polling overhead
starts to matter and `LISTEN/NOTIFY` (still no new infrastructure) is the
next step before a real queue.

---

## D30 — A guarded root-level `[city]` segment for discovery pages

**Decision.** Buyer discovery pages live at `/<city>` and
`/<city>/category/<path>` — the URL shape buyers type and search engines rank
("led bulb suppliers mumbai"). The `[city]` segment sits at the root of the
marketplace route group.

**Why this does not reopen D20.** D20 rejected `app/[tenant]` because an
unknown path would resolve to a *tenant site* — content that should never be
served on the apex. `[city]` is checked against the `Location` table
(`type = CITY, isActive`) on every request and anything else is a plain 404.
The worst case is the same 404 an unmatched path already produced. Static
routes (`/search`, `/sellers`, `/category`, `/post-requirement`, …) take
precedence over the dynamic segment, exactly as before.

**Cost.** Every new top-level static route must be added *as a route*; a typo
in a link now 404s through the city page instead of the framework's own
not-found, which is the same page. City slugs are therefore reserved words at
the apex — a category or page can never be called `mumbai`.

**Rendering.** Both pages are ISR (`revalidate = 3600`) and every read behind
them is tagged (`discovery:*`). `revalidateSellerDiscovery` purges those tags
from every seller-status, profile and catalogue write, so a newly verified
seller appears within seconds instead of after the next build — the fix for
SESSION_HANDOFF gotcha #1, which also applies to the homepage now that it is
ISR rather than fully static.

**Revisit at** the first collision between a city slug and a wanted top-level
route.

---

## D31 — The proxy resolves a loopback Host through `x-forwarded-host`

**Finding.** When a Server Action calls `redirect()`, Next.js renders the
target page by **fetching itself over loopback**: `Host: localhost`, the
visitor's real host in `x-forwarded-host`, the visitor's cookies attached. Our
proxy classified that request by its loopback Host. In development that hit
the "loopback → root domain" 307, and `fetch` drops the `Cookie` header when
it follows a redirect to another host — so the page rendered with no session,
`requireUser` bounced to `/login`, and the login page (which does see the
cookie) sent the user on to `/dashboard`, losing the destination. In
production a loopback Host is not the root host and would have fallen into
the custom-domain branch and 404ed. Every action that redirects to a guarded
page was affected: product created, business registered, onboarding steps.

**Decision.** A loopback Host defers to `x-forwarded-host` when that names a
real host (`resolveLoopbackHost` in `src/proxy.ts`). Plain loopback requests
with no forwarded host keep the development redirect.

**Why it is safe.** Only requests whose Host is loopback are affected, and
nothing reaching the origin through nginx carries a loopback Host — nginx
sets `Host` from the visitor's request. So `x-forwarded-host` cannot be used
from outside to impersonate a tenant.

**How it was found.** Logging `headers()` inside `getSessionUser` showed a
render with `x-action-redirect` set and no `cookie`; logging the proxy's
loopback branch showed the self-fetch arriving with the cookie and a real
`x-forwarded-host`. `tests/e2e/seller-onboarding-journey.spec.ts` now drives
two action redirects in a real browser and would catch a regression.

---

## D32 — Web presence is a plan tier

**Decision.** What a seller gets on the web is a property of their plan, not
a right of registration:

| `Plan.webPresence` | Seeded plans | Surface | Canonical for the seller's content |
|---|---|---|---|
| `CATALOGUE` | Free, Basic | listing + catalogue page `bzaro.in/seller/{slug}` | the marketplace pages |
| `SUBDOMAIN` | Gold | website at `{slug}.bzaro.in` | the subdomain (D1) |
| `CUSTOM_DOMAIN` | — (Pro, when D3 ships) | website on the seller's own domain | the custom domain |

The tier is denormalised onto `Seller.webPresence` (recomputed on every
subscription write by `recomputeWebPresence`, swept nightly by
`recompute-web-presence`) because it is read on every microsite request and
every canonical URL. One helper, `sellerSiteUrl()` in `src/lib/utils/url.ts`,
is the canonical rule; marketplace pages, microsite metadata, sitemaps,
JSON-LD and dashboard links all go through it.

**Routing.** A live seller on the catalogue tier whose subdomain is requested
gets a **301 to the marketplace equivalent, path preserved**
(`marketplacePathFor`: `/products/x` → `/product/{slug}/x`, everything else →
`/seller/{slug}`). Never a 404: the seller may have printed the subdomain on
visiting cards, and the redirect hands the ranking to the page that now
represents them. Status still wins over tier — a suspended seller is 403
whatever they pay for.

**Downgrade.** Same mechanism. Gold → Basic makes the subdomain redirect;
nothing is deleted, so an upgrade restores the site exactly. A `PAST_DUE`
subscription keeps its tier until `gracePeriodEndsAt`.

**Existing sellers** were not grandfathered: the migration derives the tier
from the live subscription, and the seed puts microsite fixtures on Gold.

**Billing.** There is no payment gateway. Sellers pick a plan at
`/dashboard/billing`, see the UPI / WhatsApp instructions from the `billing`
setting, and "notify the team" (an audit row). An admin assigns the plan from
the seller's admin page (`changeSellerPlan`: cancels the live subscription,
starts a new 30-day period, recomputes the tier, purges the tenant cache).
When Razorpay lands it replaces only that admin step.

**Cost.** Two surfaces to keep in sync per seller; the risk is a page that
still builds a subdomain URL by hand. `tenantUrl()` is therefore for internal
use (the resolver, the redirect target) — anything user-facing uses
`sellerSiteUrl()`. `Plan.allowCustomDomain` was folded into the enum.

**Revisit if** free sellers on the catalogue tier convert to Gold at a rate
that suggests the subdomain should be the free hook instead (the original
D1 bet), or when custom domains ship and the Pro plan is created.

---

## D33 — Storefront templates are compositions of shared sections

**Decision.** Six storefront templates (`electro`, `medico`, `autoparts`,
`minimal`, `boutique`, `fresh`) join Classic and Modern. Each is a
*composition* — `src/components/site/templates/storefronts.tsx` picks a
header variant, a footer variant, a hero cut and an ordered list of
sections — over one shared section library
(`src/components/site/storefront/`). The look is completed by the template's
preset theme tokens (colours, font pair, radius) seeded in
`prisma/seed/templates.ts`. Inner pages share the page bodies with Classic
and Modern, so the registry contract ("switching template loses nothing")
still holds for every template.

**Why compositions, not eight hand-built sites.** The reference themes
(Ochaka, XStore) differ in chrome, colour and section order far more than in
section *content*: every one has a category rail, a product grid, promo
tiles, a USP strip, a story block and an enquiry band. Building those once
means a fix to the product tile lands in six templates, and a seventh
template is an afternoon.

**What sellers control.** The template (onboarding step 4 `/register/theme`,
the dashboard Website page, or an admin on the seller's page —
`applyTemplate` applies the preset and purges the tenant cache) and the
validated tokens. Never markup (D7 unchanged).

**Font pairs** are now real: the site layout loads the allowlisted faces via
`next/font` and sets `--site-font-body` / `--site-font-heading`; `.site-root`
in globals.css applies them, with headings and `.site-display` taking the
heading face.

**Contact.** Storefront chrome opens the contact-intent modal, never a raw
`wa.me` link — the seller's number is released only after a requirement
exists (docs/LEADS.md §1). Classic and Modern were brought in line.

**Cost.** Home data grew (12 products, categories with counts and a
representative image, counts) — one cached call, tagged like before. Preview
images in `public/templates/` are screenshots of the `abc-electronics`
fixture and must be regenerated when a template changes (the Playwright
snippet lives in SESSION_HANDOFF.md).

---

## D34 — IndiaMART-style category tree, chosen at registration

**Decision.** The taxonomy is `prisma/seed/data/categories.ts`: 51 groups,
412 nodes, modelled on IndiaMART's top-level categories and their principal
subcategories; two levels for most trades, three where the seeded catalogue
already used them. Slugs are globally unique. Sellers choose a **main
category** (group → subcategory → optional specialisation, or search by trade
name) and up to four **other categories** with the same cascade
(`src/components/onboarding/CategoryPicker.tsx`). The picker posts the same
`primaryCategoryId` / `secondaryCategoryIds` the schema already validated.

**Why.** A flat list of four groups was both too small to describe a real
seller and — with subcategories rendered under the wrong parent — actively
misleading; the old checkbox list also crashed on click (a React event read
inside a state updater). Lead matching (D28) keys on the category, so a
seller who cannot find their trade gets no market leads.

**Cost.** The catalogue forms' flat `<select>` now holds ~400 rows, ordered
by materialised path so it reads as a tree; a cascading picker there is a
follow-up. Re-seeding upserts by path, so extending the tree is additive.
