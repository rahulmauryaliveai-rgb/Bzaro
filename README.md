# Bzaro

A multi-tenant B2B marketplace where **every verified seller is auto-provisioned
a website on their own subdomain** — served by one Next.js application,
resolved from the request hostname.

```
bzaro.in                    the public marketplace
abc-electronics.bzaro.in    a seller's own website
sharma-steel.bzaro.in       another seller's website
bzaro.in/dashboard          seller dashboard
bzaro.in/admin              admin
```

One deployment. One database. One codebase. No per-seller configuration, and no
DNS call when a seller signs up — a wildcard record means their subdomain
resolves the instant their row exists.

---

## Quick start

Requires Node 20+ and a PostgreSQL 15+ database.

```bash
cp .env.example .env.local
npm install
```

**Then pick a database.** Docker is recommended:

```bash
docker compose up -d          # .env.local defaults already point here
```

No Docker? Prisma ships a bundled Postgres — read the caveat below first:

```bash
npm run db:start   # starts it and points .env.local at it
```

Either way, finish with:

```bash
npm run db:deploy   # apply migrations
npm run db:seed     # 6 fixture tenants
npm run dev
```

> **Caveat on `npm run db:start`.** Prisma's bundled dev server stopped
> accepting connections nine times while this was being built. It is not a
> Postgres service — it is PGlite, Postgres embedded *inside* the Node process —
> so when that process dies the database goes with it and leaves stale lock
> files behind. The next start then fails with `Lock file is already being
> held`, naming a holder that no longer exists, and `prisma dev stop` cannot
> clear it because there is nothing left to stop.
>
> `npm run db:start` handles that: it clears orphaned locks (only after checking
> that nothing is still listening), re-syncs the port, and will not report
> success until it has run an actual query — so a dead database fails there
> rather than thirty seconds into a test run. Recovery is
> `npm run db:start && npm run db:deploy && npm run db:seed`.
>
> The symptom, if you hit it another way, is confusing: cached pages keep
> serving normally while every uncached path 500s, so the site looks healthy but
> `/api/health` returns 503.
>
> Prefer Docker. See D24 in [docs/DECISIONS.md](docs/DECISIONS.md).

### Try the multi-tenant routing

| URL                                           | What it demonstrates                       |
| --------------------------------------------- | ------------------------------------------ |
| <http://lvh.me:3000>                          | the marketplace                            |
| <http://abc-electronics.lvh.me:3000>          | a populated tenant — indexable             |
| <http://sharma-steel.lvh.me:3000>             | a sparse tenant — `noindex` (quality gate) |
| <http://patel-textiles.lvh.me:3000>           | unverified → 404                           |
| <http://kumar-tools.lvh.me:3000>              | suspended → 403                            |
| <http://verma-plastic-industries.lvh.me:3000> | renamed slug → 308 redirect                |
| <http://lvh.me:3000/dashboard>                | seller dashboard                           |
| <http://lvh.me:3000/admin>                    | admin                                      |

`lvh.me` is a public DNS name that resolves to `127.0.0.1`, including all its
subdomains — so wildcard tenant routing works locally with no hosts-file edits.

Seeded accounts use the password `devpassword123`
(`admin@bzaro.test`, `owner@abc-electronics.test`, …).

---

## Commands

| Command                  | Does                                                  |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | dev server                                            |
| `npm run verify`         | typecheck + lint + unit tests                         |
| `npm run test`           | unit tests (no database needed)                       |
| `npm run test:isolation` | **tenant-isolation suite** — the gate for every phase |
| `npm run db:migrate`     | create and apply a migration                          |
| `npm run db:seed`        | reseed fixtures                                       |
| `npm run db:studio`      | browse the database                                   |
| `npm run test:e2e`       | all end-to-end suites                                 |
| `npm run build`          | production build                                      |

---

## Documentation

| Read this                                      | For                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | System overview, folder structure, data model, deployment                       |
| [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) | **Start here.** How a hostname becomes a website, and how tenants stay isolated |
| [docs/DECISIONS.md](docs/DECISIONS.md)         | Every architectural decision and its cost                                       |
| [docs/SECURITY.md](docs/SECURITY.md)           | Threat model and controls                                                       |
| [docs/SEO.md](docs/SEO.md)                     | Canonicalisation and the index-eligibility gate                                 |
| [docs/ROADMAP.md](docs/ROADMAP.md)             | Phases and exit criteria                                                        |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)       | Wildcard DNS and TLS, env vars, cron, going-live checklist                      |
| [docs/RUNBOOK.md](docs/RUNBOOK.md)             | What to do when something breaks, and the known scaling cliffs                  |

---

## The three things to know before changing anything

**1. The tenant lives in the URL path, never in a header.**
`src/proxy.ts` rewrites `abc.bzaro.in/products` to `/site/abc/products`.
That makes the tenant part of the Next.js cache key by construction. A
header-carried tenant is invisible to the cache key, and two tenants would
collide — serving one seller's page on another seller's domain.

**2. Dashboard code never touches the unscoped database client.**
Use `forSeller(scope.sellerId)`, which injects `sellerId` into every query and
throws on a tenant mismatch. ESLint enforces this.

**3. Every Server Action authorises itself from scratch.**
A Server Action is a POST endpoint. The layout that "protects" it in the UI does
not run for a crafted request.

---

## Status

**Shipped** — foundations, tenant routing spine, seller onboarding and the
dashboard editing screens, the dynamic seller website, marketplace search and
filters, WhatsApp enquiries, the admin panel, the SEO layer (sitemaps,
structured data, OG images), and production deployment documentation.

A seller can now register, claim a subdomain, edit their profile and website,
publish, and see exactly which index-eligibility requirements (D2) are still
holding their site out of search results.

Sellers now manage their own catalogue too: products and services can be
created, edited, published and deleted from the dashboard, and publishing the
third product clears the catalogue requirement on the eligibility checklist
straight away.

Photographs upload straight from the browser to the CDN — the app server issues
a signature and verifies the result, but never handles the file itself. Works
with no Cloudinary account: a local provider stores uploads on disk in
development, and pasting an image link remains available everywhere.

Sellers also manage a gallery — add images in batches, caption them, reorder
them with up/down controls that work without JavaScript, and remove them.

**Remaining** — taxonomy admin, plan quotas, and phone OTP verification.

237 unit tests · 137 end-to-end tests · lint, typecheck and build green.
The end-to-end suite runs against a production build, and now covers the
signed-in onboarding journey — register, sign in, claim a subdomain — driven
over HTTP through the no-JavaScript form path.
