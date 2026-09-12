# SEO

The platform's SEO problem is unusual: auto-provisioning a website for every
registered seller generates thousands of near-identical, low-content subdomains
**by design**. That is the textbook doorway-page pattern, and the penalty
attaches to the root domain — every seller at once, not just the empty ones.

Everything here follows from managing that risk while still giving sellers real
ranking value.

---

## 1. Canonicalisation (D1)

Every product is reachable at two URLs:

```
bzaro.in/product/abc-electronics/led-panel-40w      marketplace
abc-electronics.bzaro.in/products/led-panel-40w     microsite  ← canonical
```

**The microsite is canonical for seller-owned content**: products, services,
about, gallery. Marketplace product and service pages carry `rel="canonical"`
pointing at the subdomain.

**The marketplace is canonical for discovery surfaces it uniquely owns**: search,
category pages, location pages, category×location pages, the seller directory.
These aggregate across sellers and exist nowhere else.

### Why this way

Sellers must get defensible SEO value from their own site — that is the
product's differentiator against a plain directory. Pooling authority on the
apex would make microsites decorative, and sellers would notice within a
quarter.

### The cost, accepted

Link equity spreads across subdomains, which search engines treat as partially
separate sites. This is precisely why the eligibility gate exists: if authority
is going to be distributed, each destination must deserve it.

### Rules

- A canonical URL is always absolute and always strips query strings and hashes.
  A canonical that varies by query parameter defeats its own purpose —
  `canonical()` in `src/lib/utils/url.ts` enforces this.
- Trailing slashes are stripped everywhere except the root, matching the Next.js
  default, so the canonical and the served URL never disagree.
- A renamed slug **308s to the current one, preserving the path**. The path
  matters as much as the host: redirecting every old URL to the new homepage
  discards the ranking of every deep page the seller had, and Google treats a
  redirect to an unrelated page as a soft 404 — so a path-dropping redirect
  costs precisely what the redirect exists to protect. The original path is
  carried through the rewrite in the `x-tenant-path` request header, because a
  layout cannot otherwise see which page below it was requested. The proxy
  overwrites that header rather than appending, so a client cannot forge it into
  an open redirect. Covered by `tests/e2e/tenant-isolation.spec.ts`.
- When a custom domain goes `ACTIVE` (Phase 10), the subdomain must **301 to
  it**, or the two become duplicates of each other.

---

## 2. Index eligibility (D2)

A microsite serves `noindex, follow` until it earns indexing.

`follow` rather than `nofollow` is deliberate: we still want crawlers to
discover and follow links out of the page, we simply do not want this page in
the index yet.

### Default requirements

| Requirement                           | Default                          | Weight |
| ------------------------------------- | -------------------------------- | ------ |
| Seller verified                       | required                         | 15     |
| Phone verified                        | required                         | —      |
| Not suspended or banned               | required                         | 10     |
| Website published                     | required                         | 10     |
| Business name                         | ≥ 3 chars                        | 5      |
| **Description**                       | **≥ 150 chars**                  | **20** |
| Logo or cover image                   | required                         | 10     |
| Location selected                     | required                         | 5      |
| Contact method (phone/WhatsApp/email) | required                         | 10     |
| Address                               | required                         | 5      |
| Catalogue                             | ≥ 3 products **OR** ≥ 2 services | 10     |
| Content not flagged                   | required                         | —      |
| **Profile score**                     | **≥ 60 / 100**                   |        |

Description carries the heaviest weight because it is the strongest thin-content
signal: a page with no prose is the definition of thin.

The catalogue rule is an **OR** so a pure services business is not gatekept for
having no products.

### Configurable, not hardcoded

Rules live in the `Setting` table under `index_eligibility`, validated by
`indexEligibilityRulesSchema`. They are tunable from the admin dashboard without
a deploy.

This matters because the thresholds are a hypothesis. The first time Search
Console reports thin content, the bar should go up that afternoon. If instead it
is blocking legitimate small sellers, it should come down just as fast. Neither
should need a release.

A malformed settings row falls back to defaults rather than throwing — a bad
config must not take the whole platform's SEO with it.

### Computed in the write path, read as a column

`SellerWebsite.indexable` is persisted. `robots.txt` and `generateMetadata` read
one boolean. Scoring at request time would put a multi-table query on a file
crawlers hit constantly.

**Recompute after:** profile edits, product/service publish or unpublish,
verification changes, suspension, moderation decisions, website publish. The
nightly `recompute-indexability` job catches anything a code path forgot — a
missed hook should cost a day of staleness, not a permanent wrong answer.

**Only revalidate caches when the flag actually flips.** A nightly sweep over
10,000 sellers must not invalidate 10,000 sites for nothing.

### Seller-facing

`evaluateEligibility()` returns **every** unmet requirement, not just the first,
each with a message written for the seller rather than the developer. The
dashboard renders this as a checklist. A gate the seller cannot see is a gate
they will call support about.

---

## 3. robots.txt

One host-aware handler at `src/app/robots.ts` serves every
hostname on the platform.

**Why one handler, and why at the app root.** Next.js supports the `robots`
metadata convention ONLY at the true app root. A `robots.ts` inside the
`[tenant]` segment produces no route at all, and one inside a route group such
as `(marketplace)/` is also not registered — both fail silently with a 404. And the
proxy deliberately excludes paths with file extensions from rewriting, so
`abc.bzaro.in/robots.txt` is not rewritten. The handler therefore reads
the `Host` header itself via `tenantParamFromHost()`.

It is `force-dynamic`: the response varies by host and must never be cached as
one static file for every hostname.

| Host                 | Response                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Apex                 | Allow, minus `/dashboard`, `/admin`, `/api/`, `/login`, `/register`, `/search?`, `/*?page=` |
| Indexable tenant     | Allow `/`, disallow `/*?*`, plus `Sitemap:` and `Host:`                                     |
| Non-indexable tenant | `Disallow: /`                                                                               |

Faceted search is disallowed because it produces effectively unlimited URL
permutations; letting crawlers enumerate them burns crawl budget that should go
to seller and product pages.

---

## 4. Metadata

`generateMetadata` in the microsite layout produces, per tenant:

- `title` — seller override, else `{businessName} — {tagline}`, with a
  `%s | {businessName}` template for child pages
- `description` — seller override, else the first 160 characters of the
  description
- `alternates.canonical` — absolute, per §1
- `robots` — driven by `website.indexable`
- **Open Graph** — `type`, `siteName`, `title`, `description`, `url`, `images`
- **Twitter** — `summary_large_image` with the same fields
- `metadataBase` — the tenant's own base URL, so every relative URL resolves
  against the right host

---

## 5. Structured data ✅ implemented

`src/lib/seo/jsonld.ts` emits, per page type:

| Page                            | Schema                                     |
| ------------------------------- | ------------------------------------------ |
| Seller profile / microsite home | `Organization` + `LocalBusiness`           |
| Product detail                  | `Product` + `Offer` (`priceCurrency: INR`) |
| Service detail                  | `Service`                                  |
| Any nested page                 | `BreadcrumbList`                           |
| Category / location listings    | `ItemList`                                 |
| Marketplace home                | `WebSite` + `SearchAction`                 |
| Seller with reviews             | `AggregateRating`                          |

**Escaping.** JSON-LD is the single sanctioned exception to the
`dangerouslySetInnerHTML` ban. It goes through a serialiser that escapes `<`,
`>` and `&`, because a seller's business name containing `</script>` would
otherwise break out of the tag. `src/lib/seo/jsonld.ts` is explicitly exempted in
`eslint.config.mjs` for exactly this reason.

**Only emit `Offer` when a price exists.** `priceOnRequest` is the default for
this market, and fabricating a price to satisfy a schema validator produces a
rich-result penalty.

---

## 6. Sitemaps (Phase 7)

**Apex** — sharded via `generateSitemaps()`:

```
/sitemap.xml           index
/sitemap/0.xml         sellers   (indexable only)
/sitemap/1.xml         products  (published + approved, indexable sellers)
/sitemap/2.xml         services
/sitemap/3.xml         categories
/sitemap/4.xml         locations
```

**Per tenant** — `abc.bzaro.in/sitemap.xml` lists that seller's pages
only, and is served empty (or 404) when the seller is not indexable.

### Rules

- Only indexable sellers appear. The gate governs sitemaps and meta robots
  together, or the two contradict each other.
- 50,000 URL / 50 MB caps per shard — at 10,000 sellers this needs sharding from
  the start.
- `lastModified` from real `updatedAt`, never `new Date()`. A sitemap claiming
  everything changed today teaches crawlers to ignore the field.
- **Staged submission.** Do not submit 50,000 URLs on day one. Ramp as sellers
  become eligible.

---

## 7. Rendering and performance

Public pages are **ISR with tag-based revalidation**, not SSR per request.
Traffic is ~99.5% anonymous reads, so caching is the whole performance story.

- `generateStaticParams` prebuilds only the top N sellers by traffic; the long
  tail is on-demand ISR.
- Revalidate windows tier by seller activity.
- Paginated listings beyond page 5 are `noindex` and dynamic rather than cached
  — deep pagination is crawl-budget waste.
- Seller images are already resized and format-negotiated by the media CDN and
  bypass the Next.js optimiser, avoiding a second resize hop.

---

## 8. Monitoring

**From launch, not month six.**

- Search Console with **per-subdomain properties** for a sample of sellers, plus
  a domain property for the root. A root-only property hides exactly the
  per-tenant signal that matters here.
- Watch: Pages → "Crawled, currently not indexed" and "Discovered, currently not
  indexed". A rising trend across subdomains is the thin-content signal, and it
  is the trigger to raise the D2 thresholds.
- Track indexable-seller count against indexed-page count. Divergence means the
  gate is set wrong in one direction or the other.
- Alert on manual actions.

---

## 9. Open SEO risks

| Risk                                             | Mitigation                                  | Status       |
| ------------------------------------------------ | ------------------------------------------- | ------------ |
| Root-domain doorway penalty                      | D2 gate, monitoring                         | Controlled   |
| Duplicate descriptions across sellers            | Duplicate detector at write time            | **Phase 7**  |
| Templated Mad-Libs titles reading as generated   | Compose from real seller attributes         | **Phase 7**  |
| Dormant sellers accumulating stale indexed pages | Auto-`noindex` after N months inactive      | **Phase 10** |
| Category × location combos generating thin pages | Only generate combos with ≥ N sellers       | **Phase 5**  |
| Subdomain vs custom domain duplication           | 301 subdomain → custom domain once `ACTIVE` | **Phase 10** |
