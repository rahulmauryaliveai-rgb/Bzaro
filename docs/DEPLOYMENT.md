# Deployment

> **Self-hosting on a VPS (Hostinger):** see [HOSTINGER.md](HOSTINGER.md) — the
> `deploy/` kit replaces Vercel, Upstash and Cloudinary with Docker + pm2 on one
> box. The DNS/TLS material below (§2–§3) applies to both.

Getting one Next.js application to serve `bzaro.in`, every
`*.bzaro.in` seller subdomain, and eventually seller-owned custom
domains — with valid TLS on all of them.

> **The one thing that makes this different from a normal Next.js deploy:** the
> wildcard domain and its certificate. Everything else is ordinary. Read §2 and
> §3 carefully; the rest you can skim.

---

## 1. Topology

```
        Cloudflare  ── DNS (wildcard) · WAF · rate limit · bot management
             │
        Vercel  ── ONE deployment, all four surfaces
          │    │
   Postgres    Upstash Redis
   + PgBouncer  rate limits
          │
   Cloudinary  ── media, signed direct uploads
```

**Provisioning a seller is a database write, not a DNS write.** Because the DNS
record is a wildcard, `abc-electronics.bzaro.in` resolves the instant the
`Seller` row exists. No per-seller API call, no propagation delay, no rate limit
on domain creation. This is the central reason the architecture uses a wildcard
rather than per-tenant records.

---

## 2. DNS

| Record     | Type                 | Value                  | Proxy        |
| ---------- | -------------------- | ---------------------- | ------------ |
| `bzaro.in` | A / CNAME flattening | `76.76.21.21` (Vercel) | see §3       |
| `www`      | CNAME                | `cname.vercel-dns.com` | see §3       |
| `*`        | CNAME                | `cname.vercel-dns.com` | **DNS only** |

### The wildcard is the whole design

One record serves every current and future seller. Add it once.

```
Type:  CNAME
Name:  *
Value: cname.vercel-dns.com
Proxy: DNS only (grey cloud)
TTL:   Auto
```

### Add the wildcard to Vercel

```bash
vercel domains add bzaro.in
vercel domains add "*.bzaro.in"
```

Wildcard domains require a **Vercel Pro** plan and are verified by DNS-01, which
means Vercel needs to create a `_acme-challenge` TXT record. Either delegate the
domain's nameservers to Vercel, or add the TXT record Vercel asks for manually
and re-verify.

---

## 3. TLS — the part that catches people out

### Constraint 1: Cloudflare's free Universal SSL does not cover wildcards

Universal SSL issues a certificate for `bzaro.in` and `*.bzaro.in`
only on paid plans. On the free plan, `abc.bzaro.in` gets a certificate
error — which looks to a visitor exactly like a compromised site.

Two ways forward:

**A. Let Vercel terminate TLS (recommended to start).**
Set the wildcard record to **DNS only** (grey cloud). Vercel issues and renews
the certificate. You lose Cloudflare's WAF and caching _on tenant subdomains_,
but the apex can stay proxied.

**B. Buy Cloudflare Advanced Certificate Manager.**
Keeps everything behind Cloudflare, wildcard included. Costs per zone per month.
Use Full (Strict) origin mode, or Cloudflare will happily serve a padlock over
an unvalidated origin connection.

### Constraint 2: a wildcard certificate covers exactly ONE label

`*.bzaro.in` matches `abc.bzaro.in`.
It does **not** match `a.b.bzaro.in`.

This is why slugs may not contain dots — enforced in three places:
`src/lib/tenant/reserved.ts`, the Zod schema, and the `Seller_slug_format` CHECK
constraint. `getSubdomain()` also returns `null` for multi-label hosts, so such
a request can never resolve to a tenant even if a slug somehow got through.

### Verifying it actually works

```bash
# Apex
curl -sI https://bzaro.in | head -1

# An arbitrary subdomain that has never been visited — this is the real test
curl -sI https://never-seen-before.bzaro.in | head -1

# Certificate covers the wildcard
echo | openssl s_client -connect abc-electronics.bzaro.in:443 \
  -servername abc-electronics.bzaro.in 2>/dev/null \
  | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"
```

The second command is the one that matters. Test with a subdomain that has
**never been requested before** — a certificate that works only for subdomains
you have already visited means per-hostname issuance, not a wildcard, and it
will fail for the next real seller who signs up.

---

## 4. Environment variables

Set in the Vercel dashboard, or `vercel env add`. Everything is validated at
boot by `src/env.ts`, so a missing value fails the deploy rather than surfacing
as `undefined` in a request handler weeks later.

| Variable                            | Scope | Notes                                                                  |
| ----------------------------------- | ----- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_ROOT_DOMAIN`           | all   | `bzaro.in` — **no port, no protocol**                                  |
| `NEXT_PUBLIC_PROTOCOL`              | all   | `https`                                                                |
| `NEXT_PUBLIC_PLATFORM_NAME`         | all   | Display name                                                           |
| `DATABASE_URL`                      | all   | **Pooled** (PgBouncer / Neon pooler)                                   |
| `DIRECT_DATABASE_URL`               | all   | Direct. Migrations only                                                |
| `AUTH_SECRET`                       | all   | `npx auth secret`                                                      |
| `AUTH_URL`                          | all   | `https://bzaro.in`                                                     |
| `AUTH_TRUST_HOST`                   | all   | `true`                                                                 |
| `UPSTASH_REDIS_REST_URL`            | all   | **Required in production**                                             |
| `UPSTASH_REDIS_REST_TOKEN`          | all   | **Required in production**                                             |
| `REVALIDATE_SECRET`                 | all   | Long random string                                                     |
| `IP_HASH_SALT`                      | all   | Long random string, rotate quarterly                                   |
| `CRON_SECRET`                       | all   | Set automatically by Vercel Cron                                       |
| `RESEND_API_KEY`                    | all   | Optional; falls back to console logging                                |
| `MAIL_FROM`                         | all   | e.g. `no-reply@bzaro.in`                                               |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | all   | Optional until uploads ship                                            |
| `OTP_PEPPER`                        | all   | **Required in production.** ≥32 chars, keys OTP hashes (docs/LEADS.md) |
| `RESEND_API_KEY`                    | all   | Buyer signup codes and password resets. Unset → codes print to the server log |
| `MAIL_FROM`                         | all   | e.g. `Bzaro <no-reply@mail.bzaro.in>`. Required alongside `RESEND_API_KEY`   |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`    | all   | Signup captcha. Unset → captcha not enforced at all                        |
| `TURNSTILE_SECRET`                  | all   | Once set, a missing or failed token is **rejected** (fails closed)          |
| `INTEGRATIONS_ENCRYPTION_KEY`       | all   | base64 of 32 bytes. Protects each seller's Razorpay/Shiprocket credentials. Rotating it makes every stored credential unreadable |
| `WHATSAPP_ACCESS_TOKEN`             | all   | Optional; OTP + lead alerts fall back to console logging               |
| `WHATSAPP_PHONE_NUMBER_ID`          | all   | Optional; as above                                                     |

> **`NEXT_PUBLIC_ROOT_DOMAIN` includes the port in development and excludes it
> in production.** This asymmetry is the single most common source of "works
> locally, breaks in production" in wildcard-subdomain apps. All hostname
> handling goes through `src/lib/utils/url.ts`, which normalises both sides —
> nothing else may build a tenant URL by hand.

---

## 5. Database

**Use the pooled connection string for the app, the direct one for migrations.**

Serverless functions open connections aggressively; without a pooler, the first
real traffic spike exhausts the Postgres connection limit. Migrations cannot run
through a transaction-mode pooler because they need session-level state such as
advisory locks.

```
DATABASE_URL        = postgres://…@…-pooler.neon.tech/db?sslmode=require
DIRECT_DATABASE_URL = postgres://…@….neon.tech/db?sslmode=require
```

`src/lib/db.ts` also sets `idleTimeoutMillis` **below** the typical proxy idle
timeout and enables `keepAlive`, with a `pool.on("error")` handler. Without that
handler an idle-client error is an unhandled `error` event, which terminates the
Node process. This was not theoretical — see D24.

### Migrations run as a deploy step, never at boot

```bash
npm run db:deploy    # prisma migrate deploy
```

Use expand-contract for anything breaking, so a rollback never strands the
database ahead of the code. Never run `migrate dev` or `migrate reset` against
production.

---

## 6. Scheduled jobs

Defined in `vercel.json`; handlers in `src/server/jobs/`.

| Job                      | Schedule     | Purpose                                                      |
| ------------------------ | ------------ | ------------------------------------------------------------ |
| `rollup-analytics`       | hourly       | AnalyticsEvent → AnalyticsDaily                              |
| `recompute-indexability` | daily 03:20  | D2 sweep — catches missed hooks                              |
| `refresh-counters`       | daily 03:40  | Reconcile denormalised counts (R7)                           |
| `prune-events`           | daily 04:10  | Drop partitions >90 days, expired tokens                     |
| `create-partitions`      | 25th monthly | Provision two months ahead (D22)                             |
| `expire-market-leads`    | hourly       | Backstop for the worker's expiry sweep                       |
| `grant-monthly-credits`  | 1st monthly  | Plan credits (docs/LEADS.md §4)                              |
| `refresh-lead-stats`     | daily 04:30  | Reconcile responseRate / lead counters                       |
| `recompute-web-presence` | daily 03:50  | Re-derive `Seller.webPresence` from live subscriptions (D32) |

Trigger manually:

```bash
curl -H "Authorization: Bearer $REVALIDATE_SECRET" \
  https://bzaro.in/api/cron/refresh-counters
```

The response body is the job's observability — it reports what actually
changed, not just that it ran.

### The lead worker (D29)

Market fan-out and WhatsApp delivery run in a second long-lived process, not
in the request and not in cron. It shares the app's environment file.

```bash
cd /srv/bzaro/app
pm2 start npm --name bzaro-worker -- run worker
pm2 save
```

`npm run worker` is `tsx --conditions=react-server src/server/worker/index.ts`;
the condition resolves the `server-only` marker so the shared service layer
loads outside Next.js. It polls every `WORKER_POLL_MS` (2 s) and sweeps
expiry every `WORKER_EXPIRY_SWEEP_MS` (5 min). Several instances may run —
every claim is `FOR UPDATE SKIP LOCKED`. Logs: `pm2 logs bzaro-worker`.

If the worker is down, DIRECT leads still land in the dashboard (they are
written in the request); MARKET leads and WhatsApp alerts queue up in
`Requirement.fanoutStatus = PENDING` / `LeadDelivery.status = PENDING` and
drain when it returns. A row that fails three times is marked `FAILED` with
the error in `fanoutError`.

---

## 7. Cloudflare (if proxying the apex)

**WAF rules worth having on day one:**

- Rate limit `POST /api/*` — 30 requests/minute/IP
- Rate limit `/search` — 60 requests/minute/IP
- Bot Fight Mode on, but **verify Googlebot is allowlisted** before enabling it
  on tenant subdomains; blocking crawlers would silently undo the entire SEO
  strategy
- Block known bad ASNs if scraping becomes a problem (risk R9)

**Do not cache HTML at Cloudflare.** Next.js manages its own ISR cache with
tag-based invalidation. A second cache layer that does not understand
`revalidateTag` will serve stale seller pages after an edit, and the seller will
report it as data loss.

---

## 8. Going live checklist

**Before the first real seller:**

- [ ] Wildcard DNS resolves for a never-before-seen subdomain
- [ ] Wildcard TLS verified with `openssl s_client` (§3)
- [ ] `NEXT_PUBLIC_ROOT_DOMAIN` has no port
- [ ] Upstash configured — the app throws on first rate-limited action without it
- [ ] `AUTH_SECRET` is not the development value
- [ ] `IP_HASH_SALT` set, and a rotation reminder scheduled
- [ ] PITR backups on, and **a restore actually rehearsed** (see RUNBOOK.md)
- [ ] `npm run test:isolation` green against staging
- [ ] `/api/health` returns 200 from the deployed app
- [ ] Search Console verified, with per-subdomain properties for a sample
- [ ] Sitemap submitted — **staged, not all at once** (see SEO.md §6)

**Deliberately deferred:**

- Nonce-based CSP (Phase 10) — needs per-request nonce generation in the proxy,
  which interacts badly with caching static HTML
- Custom domains (D3) — resolver is built; needs Cloudflare for SaaS
- Postgres RLS — layers 1 and 2 of tenant isolation are in place

---

## 9. Staging

Staging must have a **working wildcard setup on its own domain**. It is the only
place tenant routing gets exercised under real TLS before users see it, and TLS
is precisely where this architecture differs from an ordinary deployment.

```
staging.bzaro.in        apex
*.staging.bzaro.in      tenants
```

Note this needs a certificate for `*.staging.bzaro.in` specifically — the
production `*.bzaro.in` wildcard does **not** cover it, for the
one-label reason in §3.

---

## 10. Rollback

```bash
vercel rollback           # instant, previous deployment
```

Code rollback is instant. **Database rollback is not** — which is why schema
changes use expand-contract: deploy the additive migration, deploy the code,
then remove the old column in a later release. A rollback then never lands on a
schema the code cannot read.
