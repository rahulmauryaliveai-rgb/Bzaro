# Roadmap

Eleven phases. Each ends in something demonstrable. Nothing is built
speculatively ahead of the phase that needs it.

**Context:** solo founder, Claude Code as primary development assistant, ~10,000
sellers targeted in 12 months. Every choice below favours simplicity,
maintainability and low operational cost over theoretical scale.

## Delivery order so far

The roadmap's numbering and the order work was actually requested in have
diverged. Recording it plainly, because "Phase 3" means different things
depending on which one you mean:

| Requested as                     | Roadmap phase                 | Status                                    |
| -------------------------------- | ----------------------------- | ----------------------------------------- |
| Phase 2 — onboarding + dashboard | Phase 2 — Auth and onboarding | ✅ **Complete**                           |
| Phase 10 — catalogue CRUD        | Phase 3 — Catalogue and media | ✅ **Complete**                           |
| Phase 11 — image uploads         | Phase 3 — Catalogue and media | ✅ **Complete**                           |
| Phase 12 — gallery CRUD          | Phase 3 — Catalogue and media | ✅ **Complete**                           |
| Phase 3 — dynamic seller website | Phase 4 — Seller microsite    | ✅ **Complete**                           |
| Phase 4 — marketplace search     | Phase 5 — Public marketplace  | ✅ **Complete**                           |
| Phase 5 — WhatsApp enquiries     | Phase 6 — Enquiries           | ✅ **Complete**                           |
| Phase 6 — admin panel            | Phase 8 — Admin dashboard     | ✅ **Complete**                           |
| Phase 7 — SEO and performance    | Phase 7 — SEO layer           | ✅ **Complete**                           |
| Phase 8 — production deployment  | Phase 10 (deployment part)    | ✅ **Documented**                         |

**Roadmap Phases 4 and 5 were delivered ahead of Phases 2 and 3.** Both read
from the database and do not depend on the dashboard existing — seeded catalogue
data drives them. It does mean the seller-facing editing UI is still missing:
today a seller's content can only be changed through the seed or Prisma Studio.

Phase 9 as requested ("seller onboarding UI and dashboard editing screens")
completed the roadmap's Phase 2. What remains from it is phone OTP alone, listed
under that phase below.

---

## Phase 0 — Foundations ✅ COMPLETE

Scaffold, schema, tooling, and the architectural boundaries that are expensive
to add later.

**Delivered**

- Next.js 16 + TypeScript + Tailwind 4, four route groups with per-surface root
  layouts (D21)
- Prisma 7 schema: 23 models, 13 enums, full tenant ownership and indexes
- Initial migration including everything Prisma cannot express — extensions,
  `tsvector` generated columns, GIN and trigram indexes, CHECK constraints,
  partial indexes, and `AnalyticsEvent` range partitioning with a partition
  helper and a `DEFAULT` partition (D22)
- Zod-validated environment, split server/edge so the proxy never touches
  secrets
- Tenant-scoped Prisma client (`forSeller`) with ESLint enforcement
- Permission matrix, guards, Auth.js v5 with host-only cookies (D19)
- Configurable index-eligibility system (D2), pure and unit-tested
- Reserved-subdomain denylist, enforced in three places
- Rate limiter with in-memory dev fallback and production hard-fail
- Cache-tag vocabulary with immediate/background invalidation modes
- Website template registry with two templates (D7)
- WhatsApp link builder with contextual messages
- Seed with six fixture tenants covering every routing branch
- 45 unit tests; lint, typecheck and build all green

**Exit criteria met:** `npm run build` succeeds; `npm run verify` passes;
migration applies from empty; seed produces a working multi-tenant dataset.

---

## Phase 1 — Routing spine ✅ COMPLETE

The risky part, done first. Everything after this is conventional CRUD; this is
the part that is hard to change later and expensive to get wrong.

**Scope**

- Prove the proxy's four zones against the seeded fixtures
- Prove tenant resolution: found / redirect / suspended / gone / not found
- Prove cache isolation under concurrent load
- Prove no session cookie reaches a tenant host
- Playwright tenant-isolation suite green in CI

**Explicitly out of scope:** any CRUD, any marketplace feature, any dashboard
form.

**Exit criteria — met**

- [x] `npm run test:isolation` green: **19/19** against a seeded database
- [x] Six fixture tenants each return the correct status
- [x] Concurrent-load test shows zero cross-tenant bleed
- [x] No session cookie reaches a tenant host; tenant pages render identically
      with and without one
- [x] CI runs the suite on every push (`.github/workflows/ci.yml`)

### Three real bugs the suite caught, all fixed

1. **Suspended tenants returned HTTP 200.** A React Server Component cannot set
   a status code, so returning a JSX notice from the layout served the
   suspension page as healthy — indexable, and cacheable by intermediaries. Now
   `forbidden()` with a root-level `forbidden.tsx` boundary, returning a real 403. (The boundary must sit at the app root: a layout cannot render its own
   boundary, and the microsite layout is a root layout.)

2. **`robots.txt` 404'd on every host.** Next.js registers the `robots` metadata
   convention only at the true app root — inside a route group it is silently
   ignored, so the entire indexing gate was unenforced for crawlers. Moved to
   `src/app/robots.ts`.

3. **Dashboard and admin were missing `no-store`.** Next.js emits its own
   `Cache-Control` for dynamic routes, overriding the `next.config.ts` header,
   so a shared cache was permitted to store an authenticated dashboard. Now set
   on the proxy response, where it wins.

Finding 3 also surfaced that **the suite must run against a production build**:
`next dev` and `next start` emit different security headers, so asserting
against the dev server proves nothing about what ships. `playwright.config.ts`
now builds first (`PW_DEV=1` opts into the fast path).

---

## Phase 2 — Auth and seller onboarding ✅ COMPLETE

**Built**

- `lib/mail/` — `MailProvider` interface, Resend over `fetch`, console provider
  for development. `send()` never throws: a registration must not fail because
  the mail provider is having a bad afternoon.
- `lib/tokens.ts` — single-use verification and reset tokens. Only the SHA-256
  hash is stored, so a database dump cannot mint a working reset link. Purpose
  is namespaced so a reset token is never accepted as an email verification.
- `server/services/auth.service.ts` — register, verify, request reset, reset,
  change password, revoke sessions. Every privilege-reducing operation routes
  through `revokeSessions()` so D19's `sessionsInvalidAfter` contract is
  honoured in one place rather than remembered at N call sites.
- shadcn/ui installed and configured.

**Also now built** (needed to unblock the admin panel and enquiry inbox —
an admin panel nobody can sign into is not a deliverable):

- Login, register, verify-email, forgot-password and reset-password pages with
  their Server Actions, each rate-limited and validating independently
- `next` redirect target constrained to relative paths, so the login form cannot
  become an open redirect

**Onboarding and dashboard** (the remaining gap, closed last):

- `/register/business` — live slug availability checking, debounced and
  race-guarded so a slow response for an earlier value cannot overwrite the
  verdict for what the seller has since typed. The slug gets a visible URL
  preview and an auto-suggestion from the business name, because it is the one
  field here that is expensive to get wrong (D11: changeable once per 90 days).
- `createSeller` provisioning transaction — `Seller` + `SellerWebsite` +
  `SellerMember` + `SellerCategory` + free `Subscription`, five rows or none.
- Dashboard surfaces: overview, business profile, website settings (template,
  theme, meta, publish), account settings, enquiry inbox.
- **Index-eligibility checklist** on the overview — each unmet D2 requirement
  links to the page that fixes it, with a short explanation of *why* the gate
  exists. The rule was already enforced server-side; what was missing was that
  the sellers it blocked could not see it.

Publishing is deliberately its own control rather than a field inside the
settings form: it changes what the public sees and is a D2 gate condition, so it
must never be toggled as a side effect of changing a colour.

**Validation note.** The profile form does *not* enforce the D2 description
minimum. A seller must be able to save partial progress; the checklist reports
the shortfall as guidance. Refusing the save as well would be obstruction.

**Still to build**

- [ ] Phone OTP provider (phone-first Indian seller base). Until it exists, the
      account page says plainly that an unverified phone is holding the site out
      of search results, and points at support — an invisible blocker is worse
      than a missing feature.

**Exit:** ✅ a new seller registers, claims a subdomain, edits their profile, and
their microsite reflects the change; their subdomain resolves immediately, still
`noindex` until the checklist is complete.

---

## Phase 3 — Catalogue and media 🟡 MOSTLY COMPLETE (taxonomy admin and quotas outstanding)

**Built — product and service CRUD**

- `lib/validation/catalog.ts` — product and service schemas. Nothing here
  blocks a save for being *incomplete*: a seller must be able to write down a
  product name today and price it tomorrow. Only genuine correctness rules
  (lengths that protect the public page, a price that is a number, a slug that
  produces a reachable URL) are enforced.
- `lib/utils/slug.ts` — catalogue slugs are URL PATH segments, so they follow
  their own rules rather than reusing the subdomain validator: longer than a
  DNS label is fine, and collisions within a tenant resolve to `-2`, `-3` so
  the URL stays typeable.
- `lib/validation/moderation.ts` — the D10 trust rule, pure and unit-tested.
- `server/services/catalog.service.ts` — every write does three things: stays
  inside the tenant via `forSeller()`, decides moderation, and recomputes
  index-eligibility. The third is the subtle one; without it the feature still
  *appears* to work and the seller never learns why their site stays invisible.
- Dashboard: list, create, edit, publish/unpublish and soft-delete for both
  products and services, all working without JavaScript.

**Deletes are soft.** Enquiries reference products, and a buyer's enquiry
history should not develop holes because a seller tidied their catalogue.

**Built — media uploads** (D27)

- `lib/media/` — `MediaProvider` interface, Cloudinary over plain `fetch` and
  `node:crypto`, and a local disk provider so uploads work with no Cloudinary
  account. Bytes go browser → CDN; the application server never touches a file.
- The signature pins folder, public id and allowed formats. Cloudinary rejects
  any parameter the signature does not cover, so those become the only values
  the upload can use — and the folder is derived from the seller id server-side.
- `verifyUpload` re-checks the provider's signature, folder ownership and the
  URL host before anything is written. The browser's report of what happened is
  attacker-controlled and is never believed on its own.
- Wired into product images, service images, and seller logo/cover — the last
  of which is a D2 eligibility requirement, so it is a direct route out of
  "hidden from search engines".
- Pasting a link still works everywhere, as the fallback for a deployment
  without Cloudinary and for images already hosted elsewhere.

**Built — gallery**

- Add several images at once, edit their text, reorder, remove. No slug, no
  page of its own, and deliberately no draft state: a gallery image appears as
  soon as it clears moderation, and the page says so rather than letting a
  seller discover it.
- Reordering is up/down buttons implemented as a two-row SWAP, not a
  renumbering pass — it touches two rows instead of sixty and cannot corrupt
  the order of items it did not touch. Buttons rather than drag-and-drop
  because the dashboard works without JavaScript, and dragging is unusable on a
  phone and inaccessible from a keyboard.
- Capped at 60, the same number the public page renders, and enforced when
  ADDING. A seller who uploads eighty images and silently gets sixty is exactly
  the invisible failure this project keeps designing against.
- Missing alt text is reported on the page and per image. A gallery is the one
  surface that is pure photograph: with no description it carries nothing for a
  screen reader or a search engine.

**Still to build**

- [ ] Category and location taxonomy admin
- [ ] `PlanGuard` quota enforcement

**Exit:** ✅ a seller populates products, services and a gallery, uploads
photographs directly to the CDN, edits invalidate exactly the right tags, and
publishing the third product flips the catalogue requirement on the eligibility
checklist immediately. Taxonomy admin and plan quotas remain.

---

## Phase 4 — Seller microsite ✅ COMPLETE

Delivered ahead of Phases 2 and 3 — see "Delivery order" above.

**Delivered**

- All six pages, plus product and service detail: Home, About, Products,
  Products/[slug], Services, Services/[slug], Gallery, Contact
- Every field from the brief renders: logo, cover image, business name,
  description, products, services, gallery, phone, WhatsApp, email, address,
  city, state, business hours, social links
- `site-content.service.ts` — cached, tenant-scoped loaders. Every query filters
  on `sellerId` AND on live status (`PUBLISHED` + `APPROVED` + not deleted), so
  a draft product can never appear publicly
- Two templates sharing one set of page bodies, proving the registry contract:
  switching template changes one column and loses nothing
- Business hours with a timezone-correct "Open now" badge, computed in the
  seller's own timezone
- WhatsApp CTAs with contextual pre-filled messages, per product and service
- Structured data: `LocalBusiness`, `Product` + `Offer`, `Service`,
  `BreadcrumbList`, `ItemList` — with the escaping serialiser
- Per-page metadata: canonical, robots driven by the D2 gate, Open Graph,
  Twitter
- Empty states and navigation that hides sections with no content
- Catalogue seed: 11 products, 5 services, 13 gallery items across three
  tenants, deliberately uneven

**Exit criteria — met**

- [x] All eight routes build and render real data
- [x] 20 website e2e tests green, 19 isolation tests still green
- [x] One seller's catalogue never appears on another's site, and a product slug
      from another tenant 404s
- [x] Sparse tenants degrade to empty states, never errors
- [x] Structured data contains no raw `<` or `>`

**Deferred to Phase 6 with reason:** the contact page carries no enquiry form.
Shipping one before Turnstile, honeypot and rate limiting exist would hand every
seller on the platform a spam firehose. Direct phone/WhatsApp/email are the
contact path until then.

---

## Phase 5 — Public marketplace ✅ COMPLETE

**Delivered**

- `SearchProvider` interface with a PostgreSQL implementation (D4). Nothing
  outside `lib/search/` knows which engine is in use, so the Typesense
  migration is one file when D4's trip conditions fire. Every result reports
  `tookMs`, which makes the "p95 above 300 ms" condition measurable rather than
  a matter of opinion.
- Full-text search over the `searchVector` generated column, using
  `websearch_to_tsquery` so quoted phrases and `-exclusions` work and a stray
  apostrophe cannot 500 the page
- Trigram fuzzy fallback with `word_similarity`, labelled in the UI
- Faceted filters — category, location, price, verified-only, priced-only —
  each counted with its own filter removed, so the panel can widen a search
- Category and location subtree filtering via the GIN-indexed `ancestorIds`
- Search, category, location, seller directory, product directory
- Marketplace seller profile, product detail, service detail
- Real homepage with categories, latest products, suppliers and cities
- `WebSite` + `SearchAction` structured data, now that a search endpoint exists
  to declare

**Exit criteria — met**

- [x] Every filter narrows correctly, including three-level category subtrees
      and state→city location subtrees
- [x] Typos fall back to fuzzy matching and say so
- [x] Only VERIFIED, non-deleted sellers and live, approved content are
      searchable
- [x] 30 marketplace e2e tests green; 68 e2e and 102 unit tests overall

**Deferred:** category × location combo pages, gated on ≥ N sellers. They are a
thin-content risk (SEO.md §9) and only worth generating once there is enough
inventory for the combinations to be non-empty.

### Two decisions worth recording

**Marketplace vs. index visibility are different gates.** A seller must be
`VERIFIED` to appear in marketplace search at all. That is NOT the D2
indexability gate: a sparse-but-verified seller IS discoverable by buyers while
their microsite stays out of the search-engine index. Conflating the two would
make new sellers invisible to the people they are trying to reach, not just to
crawlers. Asserted by a test.

**Filtered searches are `noindex`; category pages are not.** Thousands of filter
permutations are the same catalogue sliced differently, and each one competing
in the index would cannibalise the category pages actually built to rank. The
search canonical always points at bare `/search`.

---

## Phase 6 — Enquiries and WhatsApp

- Enquiry model and forms on both surfaces
- Signed `/api/wa` redirect logging intent before forwarding
- Enquiry inbox with status pipeline
- Seller email notification
- Turnstile, honeypot, timing heuristics, rate limits
- DPDP consent text at the point of enquiry

**Exit:** a buyer enquires from both surfaces; the seller sees both; WhatsApp
links open with correct pre-filled text; clicks are attributed.

> WhatsApp records **intent only** — `wa.me` cannot confirm a message was sent.
> The seller UI must not describe these as "messages received".

---

## Phase 7 — SEO layer

- `generateMetadata` across every public route
- Canonical strategy per D1
- Dynamic OG images
- Full JSON-LD set with the escaping serialiser
- Sharded apex sitemap plus per-tenant sitemaps
- Duplicate-description detector at write time
- Search Console setup with per-subdomain properties

**Exit:** Rich Results Test passes on every page type; sitemaps validate;
incomplete tenants are correctly excluded.

---

## Phase 8 — Admin dashboard

- Platform overview, seller management
- Verification queue and state machine (D8)
- `SellerDocument` review via private signed URLs
- Content moderation queue (D10)
- Taxonomy management, enquiry oversight, reports
- Audit log, settings — including the index-eligibility rule editor
- **Audit-log admin reads, not only writes**

**Exit:** a seller goes registration → verification → live entirely through
admin tooling, every action audit-logged.

---

## Phase 9 — Billing

- `PaymentProvider` abstraction, Razorpay implementation (D6)
- Plans, checkout, subscription lifecycle
- Idempotent webhooks with the `WebhookEvent` dedupe table
- GST-compliant invoices, dunning, grace periods
- Plan-gated features: premium templates, quotas, featured listings

**Exit:** a seller upgrades and quotas change immediately; a failed renewal
downgrades cleanly after grace; replayed webhooks are provable no-ops.

---

## Phase 10 — Analytics, custom domains, hardening

- Analytics beacon, rollup jobs, seller analytics dashboard
- Custom domain provisioning (D3) via Cloudflare for SaaS
- Reviews
- Nonce-based CSP; optional Postgres RLS
- Load testing; read replica if justified
- Observability and alerting
- `RUNBOOK.md` with a **rehearsed** restore drill
- Penetration test before public launch

**Exit:** production-ready under modelled load, with an on-call runbook that has
actually been exercised.

---

## Sequencing notes for a solo developer

**Why routing before features.** Tenant isolation is the one property that
cannot be retrofitted. A cache-key collision found in Phase 8 means auditing
every page written since Phase 4.

**Why billing at Phase 9, not Phase 3.** Nothing to sell until the product
works. `PlanGuard` and the quota columns exist from Phase 0, so plans can be
enforced before they can be purchased.

**Why admin at Phase 8.** Until then, verification and moderation can be done
with `prisma studio`. Building admin UI for a workflow with six sellers is
premature.

**What to resist:**

- Microservices. A modular monolith with a clean service layer scales past
  10,000 sellers comfortably.
- Elasticsearch. Postgres FTS is sufficient; the trip conditions are in D4.
- Kubernetes. Vercel through Phase 9, containers only if cost modelling demands
  it.
- A component library of your own. shadcn/ui is copy-in and already owned.

**Recheck at 10,000 sellers:** ISR cache-entry count and cost, database
connection saturation, `AnalyticsEvent` partition pruning, sitemap shard counts,
and whether search latency has crossed the D4 trip conditions.
