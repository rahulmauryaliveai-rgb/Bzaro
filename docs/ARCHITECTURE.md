# Architecture

Multi-tenant B2B marketplace where every verified seller is auto-provisioned a
website on their own subdomain — served by **one** Next.js application,
resolved from the request hostname.

```
bzaro.in                        public marketplace
abc-electronics.bzaro.in        seller microsite
sharma-steel.bzaro.in           seller microsite
bzaro.in/dashboard              seller dashboard
bzaro.in/admin                  admin
```

> **Status:** Phases 0, 1 and 4 complete (foundations, routing spine, seller
> website). Phase 2 partial. See [ROADMAP.md](./ROADMAP.md).
> **Stack:** Next.js 16 · TypeScript · Tailwind 4 · PostgreSQL 15+ · Prisma 7 ·
> Auth.js v5 · Cloudflare DNS · Cloudinary

## Document map

| Document                               | Covers                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **This file**                          | System overview, folder structure, data model, local dev, deployment, risks                       |
| [DECISIONS.md](./DECISIONS.md)         | Every architectural decision, its cost, and what would make us revisit it                         |
| [MULTI_TENANCY.md](./MULTI_TENANCY.md) | Tenant resolution, hostname parsing, rewrite strategy, cache keys, data isolation, custom domains |
| [SECURITY.md](./SECURITY.md)           | Threat model, adversaries, controls, session strategy, per-phase checklist                        |
| [SEO.md](./SEO.md)                     | Canonicalisation, index eligibility, robots, sitemaps, structured data                            |
| [ROADMAP.md](./ROADMAP.md)             | Eleven phases, scope and exit criteria for each                                                   |
| [DEPLOYMENT.md](./DEPLOYMENT.md)       | Wildcard DNS and TLS, env vars, database, cron, going-live checklist                              |
| [RUNBOOK.md](./RUNBOOK.md)             | What to do when something is wrong, and the known scaling cliffs                                  |

**New to the codebase?** Read [MULTI_TENANCY.md](./MULTI_TENANCY.md) §3 and §5.
Everything else here is ordinary Next.js; those two sections are the parts
specific to this problem and expensive to get wrong.

---

## 1. Requirements analysis

### 1.1 Four surfaces, one deployment

| Surface            | Host                        | Rendering                      | Auth                    |
| ------------------ | --------------------------- | ------------------------------ | ----------------------- |
| Public marketplace | `bzaro.in`           | ISR, SEO-critical              | Anonymous               |
| Seller microsite   | `{slug}.bzaro.in`    | ISR per tenant, SEO-critical   | **Never authenticated** |
| Seller dashboard   | `bzaro.in/dashboard` | Dynamic, `noindex`, `no-store` | Session, tenant-scoped  |
| Admin              | `bzaro.in/admin`     | Dynamic, `noindex`, `no-store` | Session + elevated role |

Surfaces 1 and 2 are public, cacheable and read-heavy; 3 and 4 are private,
uncached and write-heavy. All four run from one Prisma schema without ever
leaking data across tenants.

### 1.2 Tenancy model

The tenant is the **`Seller`**, not the `User`. Shared database, shared schema;
every seller-owned row carries `sellerId`. See
[MULTI_TENANCY.md](./MULTI_TENANCY.md) §1.

### 1.3 Read/write asymmetry

Traffic is roughly **99.5% anonymous reads**. Three consequences run through
everything:

1. Public pages are ISR with tag-based revalidation, not SSR per request.
2. The write path may be fully dynamic and slower — nobody's SEO depends on the
   dashboard.
3. The database is sized for pooling and read replicas, not write throughput.

### 1.4 The constraint that shapes the product

Auto-provisioning a site per seller generates thousands of near-identical
low-content subdomains **by design** — the doorway-page pattern, penalised at
the **root domain**, affecting every seller at once.

This is a product requirement as much as a technical one, and it is why
[index eligibility](./SEO.md#2-index-eligibility-d2) exists.

---

## 2. Folder structure

Route groups do not appear in URLs. They exist so each surface has its own root
layout, error boundary and rendering policy (D21).

```
seller-marketplace/
├── prisma/
│   ├── schema.prisma                  23 models, 13 enums
│   ├── migrations/                    incl. hand-written SQL Prisma can't express
│   └── seed/
│       ├── index.ts                   entry
│       ├── plans.ts · templates.ts
│       ├── taxonomy.ts                categories + India location tree
│       └── sellers.ts                 6 fixture tenants, one per routing branch
│
├── src/
│   ├── proxy.ts                       ★ hostname → zone → rewrite. EDGE. No DB.
│   ├── env.ts                         server config (server-only)
│   ├── env.client.ts                  public config (edge/browser safe)
│   │
│   ├── app/
│   │   ├── (marketplace)/             bzaro.in
│   │   │   ├── layout.tsx · page.tsx
│   │   │   └── robots.ts              ★ host-aware: serves apex AND tenants
│   │   │
│   │   ├── (site)/site/[tenant]/      ★ rewrite target for tenant hosts
│   │   │   ├── layout.tsx             resolves tenant, injects theme
│   │   │   ├── page.tsx               Home
│   │   │   ├── about/ · gallery/ · contact/
│   │   │   ├── products/ + [slug]/
│   │   │   └── services/ + [slug]/
│   │   │
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/dashboard/     requireSeller() guard
│   │   ├── (admin)/admin/             requireAdmin() guard
│   │   │
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       └── health/
│   │
│   ├── components/
│   │   ├── site/
│   │   │   ├── templates/
│   │   │   │   ├── registry.ts        ★ template key → component (D7)
│   │   │   │   └── classic/ · modern/
│   │   │   ├── sections/              shared across templates
│   │   │   ├── pages/                 page bodies shared by templates
│   │   │   └── SuspendedNotice.tsx
│   │   ├── seo/JsonLd.tsx             the one sanctioned innerHTML
│   │   └── shared/WhatsAppButton.tsx
│   │
│   ├── lib/
│   │   ├── db.ts                      Prisma singleton + pg pool
│   │   ├── db-tenant.ts               ★ tenant-scoped client
│   │   ├── tenant/
│   │   │   ├── resolve.ts             ★ two-layer cached resolution
│   │   │   ├── context.ts             public projection handed to templates
│   │   │   └── reserved.ts            ★ subdomain denylist + slug rules
│   │   ├── auth/
│   │   │   ├── config.ts              Auth.js v5, host-only cookies
│   │   │   ├── guards.ts              ★ requireSellerAccess et al
│   │   │   └── permissions.ts         ★ the whole permission matrix
│   │   ├── cache/  tags.ts · revalidate.ts
│   │   ├── validation/
│   │   │   ├── auth.ts · theme.ts
│   │   │   └── index-eligibility.ts   ★ pure, configurable D2 rules
│   │   ├── whatsapp/link.ts
│   │   ├── seo/  metadata.ts · jsonld.ts
│   │   ├── mail/ index.ts · templates.ts
│   │   ├── tokens.ts                  hashed single-use tokens
│   │   ├── ratelimit.ts
│   │   └── utils/  url.ts ★ · money.ts · hours.ts
│   │
│   ├── server/
│   │   └── services/
│   │       ├── indexability.service.ts   D2 I/O half
│   │       ├── site-content.service.ts   ★ cached public content loaders
│   │       └── auth.service.ts           account lifecycle
│   │
│   ├── types/next-auth.d.ts
│   └── generated/prisma/              gitignored
│
├── tests/
│   ├── unit/                          82 tests, no DB required
│   └── e2e/
│       ├── tenant-isolation.spec.ts   ★ the gate for every later phase
│       └── seller-website.spec.ts     the microsite, all six pages
│
├── docs/
└── prisma7.config.ts                  CLI config; uses DIRECT_DATABASE_URL
```

Folders for the remaining phases (`server/actions/`, `server/jobs/`,
`lib/search/`, `lib/media/`, `lib/billing/`, `lib/seo/`) are created as their
phase arrives, rather than sitting empty.

### Five rules that keep this honest

1. `server/services/*` never imports from `app/*`. Business logic is callable
   from a Server Action, a route handler, a cron job or a test.
2. Every mutation is a Server Action doing exactly three things: validate with
   Zod, authorise via `lib/auth/guards`, delegate to a service.
3. Microsite components receive **only** `TenantContext`. They never resolve a
   tenant themselves.
4. Nothing outside `env.ts` / `env.client.ts` reads `process.env`.
5. Dashboard code never imports the unscoped `db`.

Rules 4 and 5 are enforced by ESLint, not by memory.

---

## 3. Data model

PostgreSQL 15+. Extensions: `citext`, `pg_trgm`, `unaccent`.

### Principles

1. **Tenant ownership is explicit** — every seller-owned table carries
   `sellerId`, and every index serving a seller-scoped query leads with it.
2. **Uniqueness is tenant-scoped** — `@@unique([sellerId, slug])`. Two sellers
   may both have `/products/led-panel-40w` on their own subdomains.
3. **Money is integer minor units** plus a currency code. Never `Float`.
4. **Denormalise only hot-path reads** — `productCount`, `ratingAvg`,
   `indexable` — recomputed in the write path, reconciled nightly.
5. **Enums over booleans** wherever a third state is plausible.

### Model groups

| Group     | Models                                                            |
| --------- | ----------------------------------------------------------------- |
| Identity  | `User`, `Account`, `Session`, `VerificationToken`, `SellerMember` |
| Tenant    | `Seller`, `SellerSlugHistory`, `SellerDocument`                   |
| Website   | `WebsiteTemplate`, `SellerWebsite`                                |
| Taxonomy  | `Category`, `Location`, `SellerCategory`                          |
| Catalogue | `Product`, `ProductImage`, `Service`, `GalleryItem`               |
| Demand    | `Enquiry`, `Review`                                               |
| Money     | `Plan`, `Subscription`, `Payment`, `WebhookEvent`                 |
| Telemetry | `AnalyticsEvent`, `AnalyticsDaily`, `AuditLog`, `Setting`         |

### Beyond Prisma's schema language

The initial migration is hand-extended with what Prisma cannot express:

- **Extensions** — created before any table using `CITEXT`.
- **Full-text search** — `searchVector` STORED generated columns on `Product`
  and `Service`, weighted name > brand > short description > description, with
  GIN indexes; plus trigram indexes for typo tolerance.
- **CHECK constraints** — rating range, non-negative money, ordered price
  ranges, and `Seller_slug_format` mirroring `SLUG_PATTERN` exactly. _If you
  change one, change both._
- **Partial indexes** — public listings only ever see live rows, so the indexes
  serving them are restricted to `PUBLISHED AND deletedAt IS NULL AND APPROVED`.
- **Partitioning** — `AnalyticsEvent` is range-partitioned monthly with a
  `create_analytics_partition(date)` helper and a `DEFAULT` partition, so a
  missed cron run degrades to "rows land in default", never "writes fail" (D22).

Hierarchies (`Category`, `Location`) use an adjacency list plus a materialised
`path` and a GIN-indexed `ancestorIds` array, turning "everything in this
subtree" into one indexed lookup instead of a recursive CTE.

---

## 4. Request lifecycle

```
Browser
  └─ Cloudflare            DNS (wildcard) · WAF · CDN · TLS
      └─ CDN cache         most tenant pages terminate here
          └─ proxy.ts      EDGE — string parsing only, no DB
              └─ rewrite   abc.bzaro.in/x → /site/abc/x
                  └─ RSC   layout resolves the tenant once (two cache layers)
                      └─ Prisma → PgBouncer → Postgres
```

Full detail in [MULTI_TENANCY.md](./MULTI_TENANCY.md).

---

## 5. Local development

Requires PostgreSQL 15+. Docker is recommended (`docker compose up -d`); the
bundled `npm run db:start` is a fallback with known reliability caveats — see
D24 in [DECISIONS.md](./DECISIONS.md).

```bash
cp .env.example .env.local
npm install
npm run db:start      # local Postgres; prints a port
# put that port into DATABASE_URL and DIRECT_DATABASE_URL in .env.local
npm run db:deploy     # apply migrations
npm run db:seed       # 6 fixture tenants
npm run dev
```

| URL                                           | Surface                     |
| --------------------------------------------- | --------------------------- |
| `http://lvh.me:3000`                          | marketplace                 |
| `http://abc-electronics.lvh.me:3000`          | populated tenant, indexable |
| `http://sharma-steel.lvh.me:3000`             | sparse tenant, `noindex`    |
| `http://kumar-tools.lvh.me:3000`              | suspended → 403             |
| `http://verma-plastic-industries.lvh.me:3000` | renamed → 308               |
| `http://lvh.me:3000/dashboard`                | seller dashboard            |
| `http://lvh.me:3000/admin`                    | admin                       |

### Why `lvh.me`

`lvh.me` and `*.lvh.me` are public DNS records resolving to `127.0.0.1`. No
hosts-file editing, no admin rights, and arbitrary tenant slugs work
immediately. Fallback if corporate DNS blocks it: `127.0.0.1.nip.io`.

> **The detail that bites everyone:** `NEXT_PUBLIC_ROOT_DOMAIN` **includes** the
> port in development and **excludes** it in production. All hostname handling
> goes through `src/lib/utils/url.ts`, which normalises both sides before
> comparing. Nothing else may build a tenant URL by hand.

Local HTTPS via `mkcert` + Caddy is worth adding at Phase 4, when `__Host-`
cookie prefixes and `Secure` flags start to matter.

### Commands

| Command                  | Does                          |
| ------------------------ | ----------------------------- |
| `npm run verify`         | typecheck + lint + unit tests |
| `npm run test:isolation` | the tenant-isolation suite    |
| `npm run db:studio`      | Prisma Studio                 |
| `npm run db:migrate`     | create + apply a migration    |

---

## 6. Deployment

```
        Cloudflare  ── DNS (wildcard) · WAF · rate limit · CDN
             │
        Next.js  ── ONE deployment, all four surfaces (Vercel)
          │    │
   Postgres    Upstash Redis
   + PgBouncer  rate limits
          │
   Cloudinary / S3  ── media, signed direct uploads
```

### DNS

| Record            | Type                 | Notes                                                 |
| ----------------- | -------------------- | ----------------------------------------------------- |
| `bzaro.in` | A / CNAME flattening | proxied                                               |
| `www`             | CNAME                | proxied                                               |
| `*`               | CNAME                | **the whole design** — one record serves every seller |

Provisioning a seller is a **database write, not a DNS write**. No per-seller
API call, no propagation delay, no rate limit on domain creation.

**Two constraints to settle before Phase 4:**

1. Cloudflare's free Universal SSL does **not** cover wildcards. Either buy
   Advanced Certificate Manager, or set the wildcard to DNS-only and let Vercel
   issue it (requires Vercel Pro + DNS-01 validation).
2. Certificates cover **one label only**. `*.bzaro.in` matches
   `abc.bzaro.in` but not `a.b.bzaro.in` — which is exactly why
   slugs may not contain dots.

### Hosting

**Vercel through Phase 9.** Native App Router support, ISR and tag revalidation
without configuration, wildcard domains on Pro, edge proxy included. Lowest
operational burden for a solo developer, which is the deciding factor here.

_Watch:_ function invocations scale with tenant traffic, and ISR consumes cache
storage. Model cost at 10,000 sellers before Phase 9. The containerisation
escape hatch stays viable by keeping vendor SDKs inside `lib/`.

### Database

- **PgBouncer in transaction mode** from day one. Serverless functions open
  connections aggressively and will exhaust a Postgres limit in one spike. The
  app uses pooled `DATABASE_URL`; `prisma migrate` uses `DIRECT_DATABASE_URL`,
  which cannot run through the pooler.
- **PITR backups**, with a restore drill rehearsed and documented before launch.
  An untested backup is not a backup.
- **Migrations as a separate deploy step**, never at boot. Expand-contract for
  breaking changes, so a rollback never strands the database ahead of the code.

### Background jobs

| Job                      | Cadence | Purpose                             |
| ------------------------ | ------- | ----------------------------------- |
| `rollup-analytics`       | hourly  | `AnalyticsEvent` → `AnalyticsDaily` |
| `prune-events`           | daily   | drop partitions older than 90 days  |
| `create-partitions`      | monthly | provision next month ahead of need  |
| `expire-subscriptions`   | hourly  | grace sweep, downgrade, dunning     |
| `recompute-indexability` | daily   | D2 sweep, catches missed hooks      |
| `refresh-counters`       | daily   | reconcile denormalised counts       |
| `verify-custom-domains`  | 15 min  | poll pending DNS (Phase 10)         |

Handlers live in `server/jobs/` as plain functions, equally callable from a
queue worker if the platform changes.

### Observability

Sentry with tenant tagging; structured logs carrying `requestId` and `sellerId`;
uptime checks on the apex, **one canary tenant subdomain**, and `/api/health`.

Alerts that matter: 5xx rate, connection-pool saturation, p95 latency on tenant
pages, webhook failures, and **enquiry-submission success rate** — a silent
enquiry failure is the most expensive possible bug in this product.

### Environments

`local` → `preview` (per-PR) → `staging` (wildcard TLS exercised) →
`production`. Staging must have a working wildcard setup; it is the only place
tenant routing gets tested under real TLS before users see it.

---

## 7. Risks

| #   | Risk                                              | Severity         | Control                                                                             |
| --- | ------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| R1  | Root-domain SEO penalty from thin subdomains      | **Existential**  | D2 gate; Search Console monitoring from launch ([SEO.md](./SEO.md))                 |
| R2  | Cache-key collision across tenants                | **Critical**     | Tenant in the pathname; isolation suite ([MULTI_TENANCY.md](./MULTI_TENANCY.md) §3) |
| R3  | Wildcard TLS cost and one-label limit             | High             | Settle before Phase 4; slug validation rejects dots                                 |
| R4  | `AnalyticsEvent` growth (~365M rows/yr at target) | High             | Partitioned from day one; 90-day raw retention; permanent rollups                   |
| R5  | Connection exhaustion                             | High             | PgBouncer; explicit small pool; saturation alert                                    |
| R6  | ISR cache scale (~150k entries at 10k sellers)    | Medium           | Prebuild top N only; tiered revalidate; deep pagination dynamic                     |
| R7  | Denormalised counter drift                        | Medium           | Updated in-transaction in the service layer; nightly reconciliation                 |
| R8  | Enquiry spam                                      | Medium           | Turnstile, honeypot, rate limits, spam score, admin queue                           |
| R9  | Noisy-neighbour tenant                            | Medium           | Per-tenant write limits; throttled bulk import; per-tenant metrics                  |
| R10 | Search relevance ceiling                          | Medium           | `SearchProvider` interface; trip conditions in D4                                   |
| R11 | Dormant sellers, stale indexed pages              | Low, compounding | Auto-`noindex` after N months (Phase 10)                                            |
| R12 | Vendor lock-in                                    | Low              | No vendor SDK imported outside its own `lib/` module                                |

Security risks are enumerated separately in
[SECURITY.md](./SECURITY.md#1-threat-model).

---

## 8. Status

**Phases 0 and 1 are complete.** The routing spine is proven: 19/19 tenant-
isolation tests green against seeded fixtures. Phase 2 (auth and seller
onboarding) is next.

See [ROADMAP.md](./ROADMAP.md).
