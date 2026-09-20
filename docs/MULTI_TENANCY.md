# Multi-Tenancy

How a hostname becomes a seller's website, and how tenant A can never receive
tenant B's data.

> **The one-sentence version:** the tenant is encoded into the URL path by the
> proxy, which makes it part of the Next.js cache key by construction, and every
> dashboard query runs through a client that cannot express a cross-tenant
> `where` clause.

---

## 1. Tenancy model

The tenant is the **`Seller`**, not the `User`.

- A `User` may belong to zero or more sellers via `SellerMember`.
- A `Seller` is the unit of isolation, billing, quota, subdomain and analytics.
- Every seller-owned row carries a `sellerId` foreign key.

This is **shared database, shared schema** multi-tenancy. Schema-per-tenant or
database-per-tenant would make the marketplace's cross-tenant queries — search,
category listings, the homepage — require fan-out across thousands of schemas.

At the 10,000-seller target this model is not a compromise; it is the correct
one. It stays correct well past that, because the scaling limits are ordinary
Postgres limits (index size, connection count) rather than anything tenancy
introduces.

---

## 2. Hostname parsing

**All** hostname parsing lives in `src/lib/utils/url.ts`. Nothing else may read
`NEXT_PUBLIC_ROOT_DOMAIN` or build a tenant URL by hand.

That rule exists because of one specific bug class: `NEXT_PUBLIC_ROOT_DOMAIN` is
`lvh.me:3000` in development and `bzaro.in` in production. A comparison
that forgets the port passes every local test and breaks on deploy — or worse,
passes in production and breaks locally, so nobody investigates.

### `stripPort(host)`

Normalises a raw `Host` header. Handles three cases a naive
`host.split(":")[0]` gets wrong:

| Input              | Output            | Why it matters                                                               |
| ------------------ | ----------------- | ---------------------------------------------------------------------------- |
| `lvh.me:3000`      | `lvh.me`          | The ordinary case                                                            |
| `[::1]:3000`       | `[::1]`           | IPv6 literal — `lastIndexOf(":")` would produce `[::1`                       |
| `bzaro.in.` | `bzaro.in` | Fully qualified name with trailing dot; same host, but fails string equality |

### `isRootHost(host)`

True for the apex and its `www` alias.

Implemented as exact equality, **not** `endsWith`. An `endsWith` check would
treat an attacker-registered `evil-bzaro.in` as the platform's own apex.
Asserted in `tests/unit/hostname.test.ts`.

### `getSubdomain(host)`

Returns the single subdomain label, or `null`.

Returns `null` for multi-label hosts (`a.b.bzaro.in`) **deliberately**: a
wildcard TLS certificate covers exactly one level, so such a host has no valid
certificate and must never resolve to a tenant. This is why slugs may not
contain dots, enforced in `reserved.ts`, in Zod, and by the
`Seller_slug_format` CHECK constraint.

---

## 3. The proxy: hostname → zone

`src/proxy.ts`. In Next.js 16 this file is named `proxy.ts`; it is the same
mechanism previously called `middleware.ts`.

### Rule 1 — no database access here

The proxy runs on the Edge runtime, on every matched request. Prisma is not
edge-compatible, and a per-request tenant lookup would put a database round trip
on the critical path of every page load. Classification is **pure string work**;
the tenant record is resolved later, in a React Server Component, where it can
be cached.

### Rule 2 — the tenant travels in the pathname, never in a header

This is the single most important line in the architecture.

A header-carried tenant is **invisible to the Next.js cache key**. Two tenants
would then collide in the ISR/data cache, and one seller's fully-rendered page
would be served on another seller's domain. That is a data leak, not a
performance bug, and it appears only under concurrency — which is exactly when
it is hardest to reproduce and most damaging.

Encoding the tenant in the pathname makes every tenant a distinct cache entry
**by construction**. Isolation becomes a property of the URL space rather than
something every future contributor must remember.

### The four zones

```
                       Host header
                            │
                  ┌─────────▼─────────┐
                  │ normalizeHost()   │  strip port, lowercase, drop FQDN dot
                  └─────────┬─────────┘
                            │
        ┌───────────────────┼───────────────────┬──────────────────┐
        │                   │                   │                  │
   isRootHost()      getSubdomain()        reserved label      neither
        │                   │                   │                  │
   ┌────▼────┐        ┌─────▼──────┐      ┌─────▼─────┐      ┌─────▼──────┐
   │ ZONE 1  │        │   ZONE 3   │      │  ZONE 2   │      │  ZONE 4    │
   │ apex    │        │  tenant    │      │ platform  │      │ custom     │
   │         │        │            │      │ surface   │      │ domain     │
   │ no      │        │ rewrite to │      │ no        │      │ rewrite to │
   │ rewrite │        │ /site/     │      │ rewrite   │      │ /site/     │
   │         │        │  {label}   │      │           │      │  host:{h}  │
   └─────────┘        └────────────┘      └───────────┘      └────────────┘
```

**Zone 1 — apex / www.** No rewrite. Additionally: any request to `/site/*` on
the apex returns 404, because that segment is an internal rewrite target and
must not be a second public URL for every microsite (see D20 and §7).

**Zone 2 — reserved label.** Falls through to the marketplace routes, so an
accidentally-pointed `api.bzaro.in` never resolves to a seller.

**Zone 3 — tenant microsite.**
`abc.bzaro.in/products` → `/site/abc/products`.

**Zone 4 — custom domain.** Any host not under the root domain.
`abcelectronics.com/products` → `/site/host:abcelectronics.com/products`.
The hostname is URL-encoded, because a value legal in a `Host` header could
otherwise alter the meaning of the rewritten path.

### Matcher

```
["/((?!api|_next|_static|.*\\..*).*)"]
```

Excludes API routes (host-agnostic), framework assets, and any path with a file
extension. Keeping assets out of the proxy matters for cost as much as
correctness: on a per-invocation platform, running this on every image request
is pure waste.

**Consequence:** `robots.txt` and `sitemap.xml` are _not_ rewritten. They are
handled by host-aware handlers on the apex — see `docs/SEO.md`.

---

## 4. Tenant resolution

`src/lib/tenant/resolve.ts`.

### Two cache layers, deliberately

```
React.cache            per render pass
  └─ deduplicates layout + page + N components → one query

unstable_cache + tags  across requests and users
  └─ tagged `tenant:{slug}`, revalidated on seller save
  └─ revalidate: 3600s
```

`React.cache` collapses a single render's repeated lookups. `unstable_cache`
means the second visitor to a seller's site does not hit the database at all,
and `revalidateTag('tenant:abc')` invalidates exactly one seller when they hit
save.

### The public projection

The tenant query selects an explicit field list, mapped through
`toTenantContext()` into `SellerPublic`.

This is the boundary where internal columns are dropped. Templates receive
`TenantContext` and nothing else — **a template cannot render a field it was
never given**. Exposure of `profileScore`, verification notes, or internal flags
becomes structurally impossible rather than a matter of reviewer vigilance.

### Resolution outcomes

Each outcome carries a different status, and each status carries SEO meaning:

| Outcome     | Status | Reason                                                                                                    |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `found`     | 200    | Live, verified seller                                                                                     |
| `redirect`  | 308    | Retired slug → current slug (D11)                                                                         |
| `suspended` | 403    | Suspended or banned; `noindex`, no content                                                                |
| `gone`      | 410    | Soft-deleted. **Not 404** — 410 makes crawlers drop the URL much faster, which matters when sellers churn |
| `not_found` | 404    | Unknown, or not yet verified                                                                              |

Unverified sellers resolve to `not_found`, not a "coming soon" page. A microsite
is not public until the seller is verified — the routing half of D2.

### Miss-path caching

A slug that resolves to nothing still consults `SellerSlugHistory`, and that
lookup is cached too. Caching misses is what stops a crawler enumerating
nonexistent subdomains from reaching the database on every request.

---

## 5. How tenant A never receives tenant B's data

Three independent layers. Any one failing does not produce a leak.

### Layer 1 — Guards prove ownership

`src/lib/auth/guards.ts`

```ts
const scope = await requireSellerAccess(sellerId);
```

Reads `SellerMember` from the **database on every call** — never from the JWT.
A seller removed from a business must lose access immediately, and a token
minted before their removal would still claim membership.

Returns a `TenantScope` object rather than a bare string. That makes the
difference visible at every call site: a function taking a `TenantScope` cannot
be handed an ID that arrived unchecked from a request body.

### Layer 2 — The scoped client cannot express a cross-tenant query

`src/lib/db-tenant.ts`

```ts
const tdb = forSeller(scope.sellerId);
await tdb.product.findMany(); // sellerId injected, always
```

A Prisma client extension that, for every model in `TENANT_MODELS`:

- **Reads** — injects `where: { sellerId }`, _overwriting_ any caller-supplied
  value, so a crafted request cannot widen the scope.
- **Writes** — stamps `sellerId` onto the payload, and **throws** if the payload
  names a different tenant. A mismatch is a bug or an attack; silently
  rewriting it would hide both.
- **`findUnique` / `delete`** — rerouted to `findFirst` / `deleteMany`, because
  Prisma rejects non-unique fields in a unique `where` clause. Without this
  reroute, a lookup by primary key would bypass the scope filter entirely.

Enforced by ESLint: `src/app/(dashboard)/**` may not import the unscoped `db`.

> **Adding a tenant-owned model?** Add it to `TENANT_MODELS`. A model with a
> `sellerId` column that is missing from that list is a silent isolation hole.

### Layer 3 — Postgres RLS (Phase 10, optional)

Row-level security with `SET LOCAL app.current_seller_id` per transaction. Costs
a connection-pinning constraint with PgBouncer in transaction mode, which is why
it is deferred rather than default.

### Layer 0 — the cache

Layers 1–3 protect _queries_. The cache-key strategy in §3 protects _rendered
output_, which is the part most systems get wrong. Both are required.

---

## 6. Cache-key strategy

| Concern              | Mechanism                                         | Invalidated by         |
| -------------------- | ------------------------------------------------- | ---------------------- |
| Rendered tenant page | Pathname contains the tenant → distinct ISR entry | `revalidateTag`        |
| Tenant record        | `unstable_cache(['tenant-by-slug', slug])`        | `tenant:{slug}`        |
| Custom domain lookup | `unstable_cache(['tenant-by-domain', host])`      | `tenant-domain:{host}` |
| Slug history         | `unstable_cache(['slug-history', slug])`          | `slug-history:{slug}`  |

The full tag vocabulary lives in `src/lib/cache/tags.ts`. Tags built ad hoc
drift (`tenant:abc` vs `seller:abc`), and the drift is invisible: nothing
errors, a revalidation simply never fires, and a seller stares at a stale page
while support insists the edit saved.

### Immediate vs background invalidation

Next.js 16 offers two primitives and the difference matters:

- **`updateTag(tag)`** — immediate expiry with read-your-own-writes. Server
  Actions only. This is what a seller needs: hit save, reload, see the change.
- **`revalidateTag(tag, profile)`** — marks stale for background revalidation.
  Usable anywhere, including cron jobs and webhooks, which cannot call
  `updateTag`.

Helpers in `src/lib/cache/revalidate.ts` take a `mode` accordingly.

**The rule:** a mutation revalidates its own tags **in the same function that
performs the write**, inside the service layer. Never left to a page or caller
to remember.

---

## 7. The `/site/` segment is not a public URL

Because the segment cannot start with an underscore (D20), it is a real route.
The proxy therefore returns 404 for any apex request to `/site/*`.

Without that guard, every microsite would be reachable twice — once at
`abc.bzaro.in` and once at `bzaro.in/site/abc` — duplicating the
entire catalogue and directly undermining the canonical strategy in D1.

Asserted by `tests/e2e/tenant-isolation.spec.ts`.

---

## 8. Subdomain lifecycle

**Provisioning is a database write, not a DNS write.** Because DNS is a
wildcard, `abc-electronics.bzaro.in` resolves the instant the `Seller`
row exists. No per-seller DNS API call, no propagation delay, no provisioning
queue, no API rate limit on domain creation. This is the central advantage of
the wildcard approach.

| Event       | Behaviour                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Create**  | Validate slug (format, length, denylist, profanity, uniqueness) → create `Seller` + `SellerWebsite` in one transaction |
| **Rename**  | Write old slug to `SellerSlugHistory`, update, invalidate both tags, 308 the old host forever                          |
| **Suspend** | `status = SUSPENDED` → 403 with an explanatory page and `noindex`                                                      |
| **Delete**  | Soft-delete → 410 Gone                                                                                                 |

---

## 9. Future custom domains (D3, Phase 10)

The resolver is already hostname-generic, so enabling custom domains is
provisioning work, not a routing rewrite.

### Flow

```
1. Seller enters abcelectronics.com in the dashboard
      │  requires a plan whose webPresence is CUSTOM_DOMAIN (D32)
      ▼
2. Platform stores customDomain, sets status PENDING_DNS,
   generates domainVerifyToken
      │
      ▼
3. Seller adds DNS records at their registrar:
      CNAME  @    → cname.platform-target
      TXT    _mp  → <domainVerifyToken>
      │
      ▼
4. verify-custom-domains cron (every 15 min) resolves the TXT record
      │  match → status VERIFYING
      ▼
5. Certificate provisioned via Cloudflare for SaaS Custom Hostnames
      │  issued → status ACTIVE, customDomainVerifiedAt set
      ▼
6. Requests to abcelectronics.com hit proxy Zone 4:
      → /site/host:abcelectronics.com/...
      → loadByCustomDomain() matches customDomainStatus = ACTIVE
```

### Already in place

- `SellerWebsite.customDomain`, `customDomainStatus`, `customDomainVerifiedAt`,
  `domainVerifyToken`
- `DomainStatus` enum: `NONE | PENDING_DNS | VERIFYING | ACTIVE | FAILED`
- Proxy Zone 4 with `host:` encoding
- `loadByCustomDomain()` in `resolve.ts`, gated on `ACTIVE`
- `tenantUrlFor()` prefers a verified custom domain when building canonical URLs

### Still required in Phase 10

- Cloudflare for SaaS account and per-hostname budget
- The verification cron handler
- Dashboard UI for the DNS instructions
- A canonical switch: when a custom domain goes `ACTIVE`, the subdomain must
  301 to it, or the two become duplicates of each other

---

## 10. What must stay true

Any change touching `src/proxy.ts`, `src/lib/tenant/**`, or
`src/lib/db-tenant.ts` must keep `tests/e2e/tenant-isolation.spec.ts` green.

That suite asserts:

- Two tenants render their own content, including under concurrent load
- Unverified → 404, suspended → 403, deleted → 404/410, renamed → 308
- `/site/*` 404s on the apex
- Reserved subdomains do not resolve to tenants
- No session cookie is ever set on a tenant host
- A tenant page renders **identically** with and without a session cookie —
  proving no session state leaks into cacheable output
- `noindex` and `robots.txt` follow the D2 gate
