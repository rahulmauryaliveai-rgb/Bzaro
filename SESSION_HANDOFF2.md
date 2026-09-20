# SESSION_HANDOFF2 — Bzaro (multi-tenant B2B marketplace, bzaro.in)

Complete context for continuing in a new chat. Read this, then `docs/DECISIONS.md`
(D28–D34) and `docs/LEADS.md` only if the task touches those areas.
`SESSION_HANDOFF.md` is the older, longer log — superseded by this file.

## 0. Environment (unchanged, verified working)

- Repo: `C:\Users\rahul\OneDrive\Desktop\Seller_Maketplace`, branch `main`, **one commit
  (`898597f`); ~210 files uncommitted** — everything below is uncommitted. User has not asked
  to commit; offer 4 commits (homepage/brand, D32 plans, D33 templates, D34 taxonomy+fixes).
- Stack: Next.js 16.3.4 App Router (proxy.ts middleware, ISR + `unstable_cache` tags, Server
  Actions), React 19, Prisma 7 (pg adapter; `Prisma.TransactionClient` mismatch →
  `type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]`), Zod 4, Tailwind 4
  (`bg-(--var)` shorthand), Auth.js v5 JWT, `__Host-` cookies.
- Local DB: `prisma dev` PGlite on port 51222 (`npm run db:start`; dies sometimes).
  `npm run db:deploy` (migrate deploy) then `npm run db:seed`.
- Dev server: `.claude/launch.json` name `bzaro` → `http://lvh.me:3000` (localhost redirects
  there). The in-app browser pane blocks lvh.me JS; **verify with Playwright** using
  `playwright.local.config.ts` (gitignored, `channel: "chrome"`), or ad-hoc scripts
  `node .x.tmp.mjs` from repo root (scratchpad can't resolve `playwright`).
- **`next dev` persists the data cache in `.next/dev/cache/fetch-cache`** — after a reseed that
  changes cached rows (tenant, templates), stop the server, delete that folder, restart.
  Also restart after `prisma generate` (stale client in the running server).
- In-memory rate limiters reset on restart. Login now counts **failures only**; OTP limits
  (3/phone/h, 10/IP/h) still count sends.
- `.env.local` (gitignored) has `OTP_TEST_CODE=123456` → every OTP accepts 123456 in dev.
- `npm run verify` = tsc + eslint + vitest (300 tests). E2E: `npx playwright test -c
  playwright.local.config.ts tests/e2e/<file>`. Known dev-only e2e failures (ignore): the
  "noindex and uncacheable" tests (dev sends `no-cache` not `no-store`) and
  tenant-isolation "renders identically" (HMR chunk hashes).

### Demo accounts (all password `devpassword123`)
`admin@bzaro.test` SUPER_ADMIN (login `/login?next=/admin`; plain `/login` also lands on
`/admin` now). Sellers: `owner@abc-electronics.test` (Gold, Electro template, 7 products —
the demo storefront `abc-electronics.lvh.me:3000`), `owner@pune-lighting.test` (Gold, has
leads/credits), `owner@delhi-led-house.test` (Basic → catalogue page only),
`owner@noida-lights.test` (Free), `owner@sharma-steel.test` (Gold, sparse, Autoparts),
`owner@verma-plastics.test` (Gold, Minimal; old slug `verma-plastic-industries` 301s),
`owner@patel-textiles.test` (pending verification → site 404), `owner@kumar-tools.test`
(suspended → 403), `owner@old-traders.test` (soft-deleted). Dev DB also has throwaway
`test-traders-*` sellers from e2e runs and a soft-deleted `newtechsolution`.

## 1. What was done this session (chronological)

### A. Homepage + brand theme (done, verified)
- Logo assets `public/brand/*`, `src/app/icon.png`, `apple-icon.png`,
  `(marketplace)/opengraph-image.png`, generator `scripts/brand/generate.mjs`, `docs/BRAND.md`.
- `globals.css` `@theme`: `brand-*` (blue, 700=#0b4a99, 900=#08447a) and `accent-*` (green,
  600=#1ea44f). Rule: blue = navigation, green = conversion ("Post requirement").
- Marketplace chrome: `src/components/marketplace/SiteHeader.tsx` (two-tier: search with
  city `<select name="location">` posting city **path**, green Post requirement, Sell on
  Bzaro, Sign in; navy category bar), `SiteFooter.tsx`; `SearchBar.tsx` gained `cities`,
  `size`, `id` props. `getAllCities()` now returns `path`.
- Homepage `src/app/(marketplace)/page.tsx` + `components/marketplace/Home.tsx`
  (HomeHero with product collage + live stats, TrustStrip, HowItWorks, StatsBand, SellerCta,
  Faq, SectionHeading) + restyled `Discovery.tsx`, `ResultCards.tsx`.
  `discovery.service.ts`: `getPlatformStats()`, `getCategoryGrid()` returns `imageUrl`.
  e2e `buyer-discovery.spec.ts` assertions kept (`role="search"`, "Choose your city",
  "Browse by category", `/post-requirement`, /Popular in [A-Z]/); tenant-isolation expects
  "List your business" (in footer).

### B. Web presence as a plan tier — D32 (done, verified)
- Enum `WebPresence { CATALOGUE, SUBDOMAIN, CUSTOM_DOMAIN }`; `Plan.webPresence`,
  `Seller.webPresence` (denormalised, indexed). Migration
  `20260919100000_web_presence` (also renames plan `silver`→`basic`; `allowCustomDomain`
  dropped). Seeds: free/basic = CATALOGUE, gold = SUBDOMAIN; no Pro plan seeded (user is
  holding Pro / custom domains; enum value exists).
- Rule helper `sellerSiteUrl(seller, path)` + `marketplacePathFor(slug, path)` in
  `src/lib/utils/url.ts` — THE canonical rule used by marketplace seller/product/service
  pages, tenant context `urls.base`, sitemaps, dashboard "view" links (`scopeSurface(scope)`
  in guards; `TenantScope.webPresence`).
- Routing: `resolveTenant` returns `{kind:"downgraded"}` for a live CATALOGUE seller; site
  layout `permanentRedirect`s (308) to the marketplace equivalent, path preserved. Status
  (403/404) wins over tier.
- `src/server/services/plan.service.ts`: `liveSubscriptionWhere()` (ACTIVE/TRIALING or
  PAST_DUE within grace), `getActivePlan`, `recomputeWebPresence(sellerId, client, mode)`
  ("immediate" from actions, "background" from jobs), `listPublicPlans`,
  `changeSellerPlan` (admin: cancels live sub, new 30-day period, audit, recompute),
  `getLastUpgradeRequest`. Cron `recompute-web-presence` (03:50, vercel.json + jobs/index.ts).
- No payment gateway: `/dashboard/billing` (+`?plan=key`) shows UPI/WhatsApp/email
  instructions from the `billing` Setting (`src/lib/validation/billing-settings.ts`, edited in
  Admin → Settings) and "Notify the Bzaro team" (audit row `subscription.upgrade_requested`).
  Public `/pricing` page. `components/billing/PlanLadder.tsx`. Dashboard `/dashboard/website`
  for CATALOGUE tier shows `CatalogueLinkCard` + `UpgradeCard` (only higher tiers).
  Admin seller page: "Plan & web presence" select (`changePlanAction`,
  `admin:subscription:manage`).
- Tests: `tests/unit/tenant-urls.test.ts` (+D32 cases), `tests/e2e/web-presence.spec.ts`.
  Docs: D32 in DECISIONS, LEADS/DEPLOYMENT updated.

### C. Storefront templates — D33 (done, verified)
- Six templates modelled on the user's references (Ochaka electronic/medical/auto/tech/
  fashion/art, XStore electronic/grocery/minimal/plants):
  `electro`, `medico`, `autoparts`, `minimal`, `boutique`, `fresh` in
  `src/components/site/templates/storefronts.tsx`, built via
  `src/components/site/storefront/template.tsx` (`makeStorefrontTemplate`) from the shared
  section library `src/components/site/storefront/{tokens,Header,Footer,Hero,Sections,
  ProductTile,Shell}.tsx`. Header variants mega/dark/clean/centered/fresh; footer
  light/dark/brand; hero split/sidebar/product/cover/editorial/stats. Classic + Modern kept.
  `DEFAULT_TEMPLATE_KEY = "electro"`.
- Presets (colours, fontPair, radius) + `previewImage: /templates/<key>.png` in
  `prisma/seed/templates.ts`; previews are real screenshots in `public/templates/`
  (regenerate: admin switches abc-electronics' template, screenshot home at 1280×960).
- Fonts real now: site layout loads Inter/Plex/Source Sans 3/Lora/Manrope/DM Sans via
  `next/font`, sets `--site-font-body/heading`; `.site-root` rules in globals.css.
- Data: `getHomeContent` → 12 products, 4 services, 8 gallery, `categories`
  (`listSiteCategories`: seller's categories with counts + image), `counts`.
  `listProducts(sellerId, slug, page, {q, category})`; `/products?q=&category=` on
  microsites (header search); `ProductsBody` shows category chips/results heading;
  `TenantContext.categories` filled by `loadPageContext`. `SellerPublic` gained
  `gstinVerified`, `certifications`.
- **Contact rule**: storefront chrome (and now Classic/Modern) use `<ContactIntent
  show="whatsapp" …>` (OTP lead modal), never `WhatsAppButton` raw `wa.me` links
  (`ContactButtons` gained `show`, `whatsappClassName`, `priceClassName`, `priceLabel`).
  e2e `seller-website.spec.ts` asserts no `wa.me/<digits>` on product pages.
- Choosing a template: onboarding step 4 `/register/theme` (new enum value
  `OnboardingStep.THEME`, migration `20260919150000_onboarding_theme_step`; order
  ACCOUNT→BUSINESS→TRUST→THEME→CATALOG→COMPLETE; `saveThemeStep`), dashboard Website page
  picker (`chooseTemplateAction`), admin seller page select (`adminSetTemplateAction`, new
  permission `admin:seller:website` in ADMIN/SUPER_ADMIN). All call
  `applyTemplate(sellerId, slug, key)` (applies preset tokens, keeps `showPlatformBranding`,
  revalidates tenant). `listActiveTemplates()`. UI: `src/components/site/TemplatePicker.tsx`.
- Site layout no longer renders its own "powered by" (template footers do).

### D. IndiaMART-style taxonomy — D34 (done, verified)
- `prisma/seed/data/categories.ts`: 51 groups, 412 nodes, globally unique slugs; keeps the
  legacy slugs the product/lead fixtures use (electronics/lighting/led-bulbs, …). Seed logs
  "412 categories in 51 groups". Category slug→id map in seed assumes global uniqueness.
- Registration picker `src/components/onboarding/CategoryPicker.tsx` (client): search box
  over subcategories, cascade group→subcategory→specialisation, "Add category" chips (max 4
  secondary); posts hidden `primaryCategoryId` / `secondaryCategoryIds` (schema unchanged).
  `getOnboardingOptions()` returns the nested tree. `BusinessRegistrationForm` uses it.
  `getCategoryOptions()` (product/service forms) now ordered by `path` (tree order).
- Journey e2e `firstOption(html,"primaryCategoryId")` reads the `-primary-group` select.

### E. Onboarding / auth bugs fixed (verified in browser end-to-end)
- Account step: after "Create account" the app **auto-signs-in and redirects to
  `/register/business`** (previously dead-ended on "check your inbox"; email confirmation is
  not a login gate). `registerAction` in `src/server/actions/auth.ts`.
- Old "Other categories" checkbox list crashed (`event.currentTarget` null in state updater)
  → replaced by CategoryPicker.
- Login limiter: `peekRateLimit` (non-consuming) added in `src/lib/ratelimit.ts`; login
  consumes only after a failed password.
- Sign-out buttons: `src/components/shared/SignOutButton.tsx` in admin + dashboard sidebars.
- 403 page `src/app/forbidden.tsx` is host-aware: tenant host → SuspendedNotice; apex →
  "You don't have access" with who-you-are + sign-out (was showing "site unavailable").
- **Admin demoted to seller bug**: `createSeller` set `user.role = SELLER_OWNER`
  unconditionally; the user registered a business while logged in as admin. Fixed:
  `updateMany` only promotes BUYER/SELLER_STAFF; `/register/business` page + action refuse
  platform staff (`isPlatformStaff`) → `/admin`; `requireSeller` sends staff to `/admin`;
  login page uses `homeFor(role)`. Dev DB repaired (admin SUPER_ADMIN again, accidental
  seller `newtechsolution` soft-deleted + membership removed).

### E2. GSTIN uniqueness (fixed)
- Entering a GSTIN another seller already has threw P2002 (`Seller_gstin_key`) on the trust
  step / profile page. Now `src/lib/db-errors.ts` `isUniqueViolation(error, "Seller",
  "gstin")` maps it to a `gstin` field error (`GSTIN_TAKEN`) in `saveTrustStepAction` and
  `updateProfileAction`. Dev DB: soft-deleted `newtechsolution` still holds
  `09CCQPM2965L1ZQ`, so that GSTIN is taken.

### E3. Lead inbox list hides contacts (done)
- `LeadCard` shows the requirement only (no name/phone, not even masked); contact is on
  the lead page, whose `markLeadViewed` drops the "N new" count. e2e updated.

### E4. Credits on plan change (done)
- `changeSellerPlan` now calls `topUpCreditsForPlanChange` (credit.service): grants the
  current month's credits immediately (difference vs. what the period already granted;
  MONTHLY_GRANT first, then ADMIN_ADJUST top-up). Previously an admin upgrade left 0 credits
  until the 1st-of-month cron. `newtech` seller topped up to 40 in dev DB.

### F. Admin pages built (verified)
- `/admin/categories` (tree editor: add group/sub/specialisation, rename, image URL, order,
  activate/deactivate; never deletes), `/admin/locations` (states/cities, clusterKey,
  activate), `/admin/subscriptions` (filters, upgrade-requests queue → seller page),
  `/admin/plans` (edit/create plans incl. `webPresence`; saving recomputes subscribers'
  tier; revalidates tag "plans" + `/pricing`).
  Services `admin-taxonomy.service.ts`, `admin-billing.service.ts`; actions
  `admin-taxonomy.ts`, `admin-plans.ts`.

## 2. Key constraints / decisions to respect
- Templates are code; sellers only pick a template + validated tokens (D7/D33).
- Never expose seller WhatsApp pre-OTP anywhere public (LEADS §1) — use ContactIntent.
- `tenantUrl()` is internal; user-facing URLs go through `sellerSiteUrl()` (D32).
- Dashboard route code may not import `@/lib/db` (eslint rule) — put queries in services.
- Category slugs must stay globally unique; never delete categories/locations (deactivate).
- D1 revised: canonical = seller's highest surface (marketplace page for CATALOGUE tier).
- Held by user: Pro plan / custom-domain provisioning (agreed route: Vercel Domains API),
  Razorpay (admin assigns plans until then).

## 3. Unfinished / known issues
- Nothing committed. Admin nav link "Analytics" in seller dashboard still `soon`.
- Product/service forms use a flat 412-row `<select>` (tree-ordered); a cascading picker
  there is a follow-up.
- Gallery seed images (picsum redirects) often render blank in screenshots — timing only.
- Storefront previews were captured before the ContactIntent swap (header CTA text is the
  same, so fine); regenerate if templates change.
- Dev DB carries e2e leftovers (`test-traders-*` sellers); harmless.
- SUPER_ADMIN-only pages: Settings (`admin:settings:manage`). ADMIN role can do everything
  else incl. `admin:seller:website`, `admin:taxonomy:manage`, `admin:plan:manage`.

## 4. Suggested next steps
1. Commit the work (4 logical commits) — ask the user first.
2. Cascading CategoryPicker in Product/Service forms (reuse `CategoryPicker`, single value).
3. Pro plan: create from `/admin/plans` (webPresence CUSTOM_DOMAIN) + build provisioning
   (Vercel Domains API, `verify-custom-domains` cron, dashboard domain panel) when unheld.
4. Razorpay subscription flow replacing "Notify the Bzaro team".
5. Deploy prerequisites (see docs/DEPLOYMENT): `OTP_PEPPER`, `BUYER_COOKIE_SECRET`, worker
   (`npm run worker`) under PM2, cron entries incl. `recompute-web-presence`; do NOT set
   `OTP_TEST_CODE` in production.

## 5. Deployment kit (added 2026-09-20)

- Repo moved to `C:\dev\Seller_Maketplace` (out of OneDrive); all work committed and pushed to `github.com/rahulmauryaliveai-rgb/Bzaro` `main`.
- `deploy/` — Hostinger VPS kit: `compose.yml` (postgres, redis + serverless-redis-http as the Upstash REST shim, Caddy with Cloudflare DNS-01 for the `*.bzaro.in` wildcard cert), `Caddyfile` (serves `/uploads/*` from disk, proxies the rest to `127.0.0.1:3000`), `ecosystem.config.cjs` (pm2 `bzaro-web` + `bzaro-worker`), `setup-vps.sh` (one-shot bootstrap), `deploy.sh` (redeploy), `crontab` + `cron-run.sh` (replaces Vercel Cron), env examples.
- `prisma/seed/production.ts` (`npm run db:seed:prod`): settings, plans, templates, taxonomy, partition, one admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` — no demo data.
- `MEDIA_LOCAL_UPLOADS=1` (src/env.ts, src/lib/media/index.ts) permits the local-disk upload provider in production on the VPS.
- Guide: `docs/HOSTINGER.md`. Requires the domain's DNS on Cloudflare (free) for the wildcard certificate; OTP/WhatsApp and email still need provider keys before buyers can complete contact flows.

## 6. LIVE on Hostinger VPS (2026-09-20)

- VPS `srv1975168` (KVM 2, Ubuntu 24.04, IP 187.127.179.245). SSH as root with key `~/.ssh/bzaro_vps` (added via hPanel). DNS is on **Cloudflare, proxied** (apex, www, `*`).
- Stack: `/srv/bzaro/app` (root-owned clone of `main`), Docker `bzaro-postgres` / `bzaro-redis` / `bzaro-redis-http` / `bzaro-caddy`, pm2 `bzaro-web` + `bzaro-worker` (pm2-root on boot), `/etc/cron.d/bzaro`. Env: `/srv/bzaro/app/.env` and `deploy/.env` (generated secrets). Old Sept-12 deployment (nginx/certbot/native postgres/demo seed) stopped, disabled and backed up in `/root/bzaro-old/` (db dump, env, nginx conf, app-old).
- Admin: `rahulmauryaliveai@gmail.com` (initial password given to the user in chat; local copy `~/.ssh/bzaro-admin-initial.txt` — delete once changed). Production DB has ONLY reference data + this admin.
- TLS: Caddy on-demand per hostname, gated by `/api/tls/ask`. Two deploy fixes found live: www must be matched inside the wildcard block; Next must start WITHOUT `-H` (else tenant rewrite is proxied over TLS → 500). `deploy.sh` now force-recreates Caddy (single-file bind mount keeps old inode).
- Redeploy: push to `main`, then `ssh root@187.127.179.245 'bash /srv/bzaro/app/deploy/deploy.sh'`.
- Still unconfigured: WhatsApp Cloud API (buyer OTP/lead alerts → logs), Resend email, Cloudinary (local uploads in use), Google sign-in. Note: Cloudflare proxy is on; origin cert is Let's Encrypt so "Full (strict)" is fine.
