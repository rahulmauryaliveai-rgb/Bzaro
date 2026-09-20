# Bzaro — Deployment Session Handoff

**Session date:** 2026-09-12 · **Written:** 2026-09-17
**Goal of session:** deploy Bzaro to Hostinger VPS. Outcome: **live at https://bzaro.in**, two items unfinished.

---

## 1. Project

| | |
|---|---|
| App | Multi-tenant B2B marketplace. Per-seller microsites on wildcard subdomains |
| Stack | Next.js 16.3.4, React 19.2.8, Prisma 7 + Postgres, NextAuth v5 (beta), Tailwind 4, shadcn, Cloudinary, `@upstash/ratelimit` |
| Repo | `github.com/rahulmauryaliveai-rgb/Bzaro` — **PUBLIC**, branch `main` |
| Local | `C:\Users\rahul\OneDrive\Desktop\Seller_Maketplace` |
| Live | https://bzaro.in |

---

## 2. Infrastructure (all built this session)

**Hostinger VPS KVM 2** — `srv1975168.hstgr.cloud` · **187.127.179.245** · VM id `1975168` · Ubuntu 24.04.4 · 2 vCPU / 8 GB / 96 GB

| Component | Detail |
|---|---|
| App path | `/srv/bzaro/app`, owned by user `bzaro` |
| Node | 22.23.2, npm 10.9.8 |
| Postgres | 16.15, DB `bzaro`, role `bzaro`, localhost only |
| Redis | 7, `requirepass` set, bound `127.0.0.1 172.17.0.1` |
| SRH | Docker container `srh` (`hiett/serverless-redis-http`), `-p 127.0.0.1:8079:80`, connects `redis://:PW@172.17.0.1:6379` |
| Process mgr | PM2 fork mode, app name `bzaro`, port 3000; systemd unit `pm2-bzaro` **enabled** (survives reboot) |
| nginx | `/etc/nginx/sites-available/bzaro` (symlinked to sites-enabled; default site removed) |
| TLS | Let's Encrypt for `bzaro.in` + `www.bzaro.in`, certbot auto-renew timer active |
| Firewall | UFW: 22/80/443, plus `172.17.0.0/16 → 172.17.0.1:6379` for the Docker bridge |
| SSH | Key-only, passwords disabled. Key `bzaro-deploy` (id 577648) registered + attached in Hostinger |
| Backups | `/etc/cron.daily/bzaro-db-backup` → `pg_dump -Fc` to `/var/backups/bzaro`, 14-day retention. Verified working |

### ⚠️ Server access constraint
**No SSH from either Claude shell.** Cloud sandbox blocks port 22 (HTTPS-only egress proxy); the local device VM has no network at all. **The only working access path is the Hostinger web console** (VPS → Overview → *Web console*), driven via Claude-in-Chrome.

Its URL is a one-shot session link. Retrieve it by hooking `window.open` on the VPS overview page:
```js
window.__c=[];window.open=function(u){window.__c.push(u);return{focus(){},close(){}}};
[...document.querySelectorAll('button')].find(x=>/web console/i.test(x.textContent)).click();
// then read window.__c  →  https://mum2.hostingervps.com/4498/?session_id=...
```
The console tab wedges after heavy use — close it and open a fresh session.

---

## 3. Secrets

All generated **on the server**; none originated in chat.

- `/srv/bzaro/app/.env.production` — chmod 600, owner `bzaro` (13 + 3 vars)
- `/root/.bzaro_dbpw`, `/root/.bzaro_redispw`, `/root/.bzaro_srhtoken`
- Cloudinary: cloud name `usyswaag`, key `529367917749347` — verified against Admin API (HTTP 200). Secret was supplied by user in chat → **rotating it is advisable**.
- The local `.env.production.local` is now obsolete and can be deleted.

Env values of note: `UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079`, `AUTH_URL=https://bzaro.in`, `NEXT_PUBLIC_ROOT_DOMAIN=bzaro.in`, `NODE_ENV=production`.

---

## 4. Files created/modified

### On server only — **DIVERGED FROM REPO**
| File | Change |
|---|---|
| `next.config.ts` | **HSTS narrowed** to `max-age=63072000` — removed `includeSubDomains; preload`. Backup: `/root/next.config.ts.hsts-bak`. Marked with a `// TEMP:` comment. **Not committed to git — a repo redeploy will silently reintroduce the bad header.** |
| `.env.production` | Created (gitignored) |
| `/etc/nginx/sites-available/bzaro` | Created. Pre-certbot backup: `/root/bzaro-nginx.bak` |
| `/etc/cron.daily/bzaro-db-backup` | Created |
| `/etc/ssh/sshd_config.d/99-bzaro.conf` | Created |

**Why HSTS was narrowed:** `includeSubDomains` on the apex makes browsers force-upgrade `*.bzaro.in` to HTTPS, where no wildcard cert exists yet — an unbypassable hard failure for every seller microsite. `max-age` is 2 years, so it's sticky. **Restore both directives once wildcard TLS is live.**

### nginx layout (deliberate)
- `:80` `bzaro.in www.bzaro.in` → 301 to HTTPS
- `:80` `*.bzaro.in` → proxies to :3000, **no redirect** (tenants stay HTTP until wildcard TLS)
- `:443` `bzaro.in www.bzaro.in` → proxies, sets `X-Forwarded-Proto https`
- `client_max_body_size 5m` (server actions cap is 2 MB)

---

## 5. Key decisions

1. **SRH instead of rewriting `ratelimit.ts`.** The code speaks Upstash's REST protocol; SRH exposes a real self-hosted Redis over that exact API. **Zero code change** to a security-critical file.
2. **Redis password** rather than `protected-mode no` — needed for Docker-bridge access, and better security.
3. **Postgres + Redis local** on the VPS (user's choice over managed).
4. **Cloudflare free** for wildcard TLS. LE can't do wildcards over HTTP-01, and Hostinger has no official certbot DNS plugin. Cloudflare Universal SSL covers apex + one wildcard level, and `getClientIp()` already reads `cf-connecting-ip` first — the code was written expecting a Cloudflare-style edge.
5. Secrets generated server-side, never transiting chat.

---

## 6. Gotchas — do not relearn these

1. **🔴 The marketplace homepage is statically prerendered.** Database changes do **not** appear after a PM2 restart or after clearing `.next/cache`. Only `npm run build` regenerates it. This cost significant time. Will recur the first time a real seller registers and doesn't show up.
2. `NEXT_PUBLIC_*` vars are inlined at **build** time and also gate `images.remotePatterns` in `next.config.ts` — adding Cloudinary config requires a rebuild, not a restart.
3. `unstable_cache` wraps marketplace/taxonomy services with `REVALIDATE = 3600` (disk cache, survives restarts).
4. **Hostinger panel keeps dropping into an impersonated session** for `rk1990m@gmail.com` (purple *Admin access* banner). While impersonating, the VPS appears not to exist and `/vps/1975168/overview` redirects to `/vps`. **Click `Exit` first.**
5. **Email is not configured.** No `RESEND_API_KEY` → `ConsoleMailProvider` prints every email (verification links, password-reset links, enquiry notices) to PM2 logs: `/home/bzaro/.pm2/logs/bzaro-*.log`. Useful for dev; broken for real users.
6. The local Windows checkout shows ~10 modified files in `git diff` — **pure CRLF noise**, not real changes. `git diff --ignore-all-space` is empty except `.claude/launch.json`.
7. `/dashboard` and `/admin` exist on the **apex only**. The proxy rewrites everything on a tenant subdomain into that tenant's public path space.
8. Hostinger **DNS API returns 403** — `bzaro.in` lives in a different account. Zone is editable only via the panel UI (endpoint: `/api/dns/v1/direct/zone/resource-records?domain=bzaro.in`).

---

## 7. Current state

### Working ✅
- `https://bzaro.in` and `https://www.bzaro.in` — HTTP 200, valid LE cert; HTTP 301s to HTTPS
- `http://<tenant>.bzaro.in` — 200 (HTTP only, by design)
- `/login`, `/register`, `/forgot-password`, `/dashboard`, `/admin` all render
- Cloudinary verified live (Admin API 200); cloud name confirmed inlined in client bundle
- SRH round-trip verified (`SET`/`GET` → `{"result":"OK"}`)

### Data — demo content, must be removed before launch
`npm run db:seed` (the **dev** seed) was run on production at the user's explicit request:
- **6 sellers** (3 publicly visible), **21 categories**, **11 products**; analytics partition created
- Fixtures deliberately cover every tenant state: VERIFIED / PENDING (404) / SUSPENDED (403) / soft-deleted (410) / renamed-slug (308)
- Seed set all 7 accounts to `devpassword123` — **a value printed in the public repo**. All 7 were rotated to a random unknown value, then the user set their own passwords via the app's reset flow.
- Categories + cities + plans + templates are legitimate production reference data; **sellers and products are not**.

### Accounts
`admin@bzaro.test` (SUPER_ADMIN) · `owner@{abc-electronics, sharma-steel, patel-textiles, kumar-tools, old-traders, verma-plastics}.test` (SELLER_OWNER)

Login: `https://bzaro.in/login` for both roles (app routes by role) · admin: `…/login?next=/admin` · self-service password change: `https://bzaro.in/forgot-password`

### DNS / domain
- `bzaro.in` registered in the **`rk1990m@gmail.com`** Hostinger account, shared with the user's account via admin access. **Auto-renewal was OFF** — check.
- Zone: `@ A → 187.127.179.245`, `www CNAME → bzaro.in.`, `* A → 187.127.179.245` (wildcard added by user)
- Nameservers as of Sep 12: `artemis` / `hermes.dns-parking.com` (Hostinger)
- Cloudflare account `Work.nts1@gmail.com`; zone created; assigned NS **`sara.ns.cloudflare.com`** / **`finley.ns.cloudflare.com`**
- NS switch was blocked by Hostinger's **24-hour new-registration registrar lock**. That lock has long since expired — **status unverified as of Sep 17, check first.**

---

## 8. Unfinished work → next steps

### A. Cloudflare cutover + wildcard TLS (the main outstanding item)
1. **Verify current state first:** `dig +short NS bzaro.in` and check whether the Cloudflare zone is Active. It may already be done.
2. In Cloudflare, before touching nameservers: confirm `@`, `www`, `*` records exist and are **proxied (orange cloud)**, and set **SSL/TLS mode to Full (strict)**.
   > 🔴 Leaving it on the default **Flexible** causes an infinite redirect loop — Cloudflare speaks HTTP to the origin while nginx 301s HTTP→HTTPS. Site goes down. This is the most common way this cutover fails.
3. Switch Hostinger nameservers to the two Cloudflare ones.
4. After propagation:
   - Restore full HSTS in `next.config.ts` (`includeSubDomains; preload`) from `/root/next.config.ts.hsts-bak`, then `npm run build` + `pm2 restart bzaro`
   - Add a `:443` server block / adjust `server_name` for `*.bzaro.in`, and re-add the HTTP→HTTPS redirect for subdomains
   - Restrict UFW 80/443 to Cloudflare IP ranges only
   - Verify `cf-connecting-ip` reaches `getClientIp()` (`ratelimit.ts` comments state the origin must not be publicly reachable)

### B. Commit the server-side HSTS change to the repo
Server and `main` have diverged. A deploy from the repo will reintroduce `includeSubDomains`. Either commit the temp change or the restored version once (A) is done.

### C. Configure transactional email (blocks real signups)
Add `RESEND_API_KEY` + `MAIL_FROM`. Without it a new seller sees *"Check your inbox"* and nothing arrives; password reset is impossible for them; enquiry notifications don't send. Registration itself still completes — email verification is only a badge in dashboard settings, not a hard gate. Requires DNS records in Resend for `bzaro.in` — **do after the Cloudflare cutover** so DNS is touched once.

### D. Housekeeping
- Turn **auto-renewal on** for `bzaro.in`
- **Delete demo seed data** before launch (keep categories/cities/plans/templates, drop fixture sellers + products)
- Rotate the Cloudinary API secret (it transited chat)
- Consider PM2 cluster mode (2 instances for 2 vCPU) — safe now that Redis-backed rate limiting is shared
- `*** System restart required ***` is pending on the VPS; a reboot also validates the `pm2-bzaro` unit end to end

---

## 9. Claude tooling limits hit (don't retry these)

The following were **refused by the safety classifier** — delegate to the user rather than re-attempting:

| Action | Reason given |
|---|---|
| Writing DNS records / changing nameservers | DNS / Domain / Cert Changes |
| Setting a user password (SQL or helper script) | Blocked by classifier |
| Revealing the Cloudinary API secret from the console | Credential Materialization |
| Reading password-reset links from PM2 logs | Credential Materialization |
| `SELECT` on the `User` table | Production Reads |
| `reboot` | Blocked by classifier |

Also: the Hostinger MCP connector is **currently disconnected and needs re-authorization** (claude.ai connector settings). It has no "list VPS" or "reinstall OS" endpoint in this build, and its DNS endpoints 403 for this domain.

**Useful workaround that does work:** the public repo can be cloned into the cloud sandbox (`git clone --depth 1 https://github.com/rahulmauryaliveai-rgb/Bzaro.git`) to read code with normal tools instead of paging it through the web console.

---

# Session 2026-09-17 — IndiaMART-style discovery + lead system (Phases 1–6)

**Not committed.** Everything below is in the working tree on `main`.
Reference docs written this session: `docs/LEADS.md`, DECISIONS D28–D31.

## What shipped
1. **Schema + migrations** `20260917120000_leads_discovery`, `20260917140000_user_whatsapp` (Buyer, OtpChallenge, Requirement, Lead, LeadDelivery, SellerServiceArea, CreditLedger, LeadFlag; Seller/Location/User fields). Applied to the local DB only.
2. **Buyer contact flow** — OTP modal on contact intent (`src/components/buyer/*`), DIRECT lead + wa.me hand-off, `/post-requirement`.
3. **Worker** — `npm run worker` (`src/server/worker`): market fan-out, WhatsApp delivery outbox, expiry sweep. PM2: `pm2 start npm --name bzaro-worker -- run worker`.
4. **Seller inbox** `/dashboard/leads`, `/dashboard/credits`; admin `/admin/leads`, `/admin/leads/flags`; credit adjust on the admin seller page.
5. **Discovery** — homepage is ISR now; `/[city]`, `/[city]/category/[...path]`; sitemap `discovery` shard; `revalidateSellerDiscovery` from every seller/product write.
6. **Onboarding** — `/register` (phone + optional OTP + WhatsApp) → `/register/business` → `/register/trust` → `/register/catalog`; profile completion bar; phone verification in settings.

## Deploy prerequisites (server .env.production)
- `OTP_PEPPER`, `BUYER_COOKIE_SECRET` (≥32 chars) — app refuses to boot without them.
- Optional `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (console providers until then).
- `npm run db:deploy`, `npm run db:seed` is NOT needed (seed = dev fixtures); set `Plan.leadCreditsPerMonth` + `Location.clusterKey` in prod by hand or a one-off script.
- Start the worker under PM2; add the three cron entries from `vercel.json` to whatever runs cron on the VPS.

## Bugs found in existing code (fixed)
- `src/env.ts` `requiredInProd` never made a key optional under Zod 4.
- `src/proxy.ts`: Next's self-fetch for Server Action redirects arrives with a loopback Host; the proxy 307'd it and the cookie was lost → every action `redirect()` to a guarded page bounced through `/login` (D31). Affected product-create and business-registration redirects too.

## Testing notes
- Playwright's Chromium could not be downloaded here; `playwright.local.config.ts` (gitignored) runs with `channel: "chrome"`.
- Browser flows need `OTP_TEST_CODE=123456` in the server env (honoured outside production, or with `ALLOW_INSECURE_RATE_LIMIT=1`).
- Full suite passed against a production build; three tenant-isolation tests fail only under `next dev` (cache-control on redirects, non-deterministic dev HTML) — pre-existing.
- PGlite (D24) died several times during long e2e runs; `npm run db:start` brings it back, data survived.

## Open
- The `/[city]` route shape was implemented as specified with the D30 guard; say if you prefer a `/city/...` prefix.
- `Subscription.leadCreditsUsed` is deprecated in place (never written); drop in a later migration.

## Session: web presence as a plan tier (D32)

- `Plan.webPresence` / `Seller.webPresence` enum `CATALOGUE | SUBDOMAIN | CUSTOM_DOMAIN`
  (migration `20260919100000_web_presence`; `allowCustomDomain` folded in; plan
  `silver` renamed `basic` in the migration and the seed).
- Rule: `sellerSiteUrl()` in `src/lib/utils/url.ts` — every canonical, sitemap
  entry, JSON-LD url and dashboard "view" link goes through it.
- Routing: `resolveTenant` returns `downgraded` for a live CATALOGUE seller; the
  site layout 301s to `marketplacePathFor(slug, path)`.
- `src/server/services/plan.service.ts`: `getActivePlan`, `recomputeWebPresence`
  (called from admin `changeSellerPlan` with "immediate" purge, nightly job
  `recompute-web-presence`), `listPublicPlans`.
- UI: `/pricing`, `/dashboard/billing` (+ `?plan=`), `/dashboard/website` tier
  aware (CatalogueLinkCard + UpgradeCard), admin seller page "Plan & web
  presence" select, admin settings "Billing" (UPI / WhatsApp / instructions).
- Fixtures: microsite sellers on Gold; delhi-led-house Basic (catalogue tier);
  noida-lights Free. E2E: `tests/e2e/web-presence.spec.ts`.
- Gotcha: the in-memory login limiter (10/h/IP) trips after ~2 e2e runs that
  log in; restart the dev server between runs.
- Held: Pro plan / custom-domain provisioning (Vercel Domains API route agreed),
  Razorpay. Admin assigns plans until then.

## Session: storefront templates (D33), IndiaMART taxonomy (D34), onboarding fixes

- Six storefront templates in `src/components/site/templates/storefronts.tsx`
  composed from `src/components/site/storefront/` (Header/Footer/Hero/
  Sections/ProductTile/Shell). Presets + preview images in
  `prisma/seed/templates.ts` and `public/templates/*.png`.
- Template choice: `/register/theme` (new onboarding step `THEME`, migration
  `20260919150000_onboarding_theme_step`), dashboard Website page,
  admin seller page (`admin:seller:website`). All call `applyTemplate`.
- Taxonomy: `prisma/seed/data/categories.ts` (412 nodes); registration uses
  `CategoryPicker` (cascade + search). `getOnboardingOptions` returns the tree.
- Fixes: account step now auto-signs-in → `/register/business` (the
  "check your inbox" dead end); old category checkbox crash; login limiter
  counts failures only; sign-out in both sidebars.
- Dev: `.env.local` sets `OTP_TEST_CODE=123456` so every OTP accepts it.
  `next dev` persists the data cache in `.next/dev/cache/fetch-cache` —
  delete it (server stopped) after a reseed that changes cached rows.
- Regenerate template previews: log in as admin, for each key set the
  template on abc-electronics via the admin page, screenshot
  `http://abc-electronics.lvh.me:3000/` at 1280×960 to `public/templates/<key>.png`.
