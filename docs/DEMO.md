# Sales demo — a separate copy of Bzaro for pitching sellers

**Why separate.** Sample sellers on the live marketplace would receive real
buyers' requirements and look like real businesses. The demo is its own
domain, database and app processes on the same VPS, so it can be as full of
sample data — and test payments — as a pitch needs, with nothing leaking into
the live site, its leads or its search ranking.

| | Live | Demo |
|---|---|---|
| Domain | bzaro.in | its own (e.g. bzarodemo.in) |
| Folder | /srv/bzaro | /srv/bzaro-demo |
| Database | bzaro | bzaro_demo (same Postgres) |
| pm2 | bzaro-web :3000, bzaro-worker | bzaro-demo-web :3001, bzaro-demo-worker |
| Caddy | owns it (deploy.sh) | site file `/srv/bzaro/shared/caddy-sites/demo.caddy` |
| Search engines | indexed | `X-Robots-Tag: noindex` on every response |
| Banner | — | "Demo of Bzaro — sample businesses and test payments only" |
| Google sign-in | yes | hidden (email sign-in only) |

## One-time setup

1. Buy the domain; add it to Cloudflare (free plan); switch nameservers.
2. Cloudflare, on the new zone: DNS `A @` and `A *` → the VPS IP, **Proxied**;
   SSL/TLS **Full (strict)**; **Always Use HTTPS** on; Origin Server →
   **Authenticated Origin Pulls → Global ON**.
3. Cloudflare → SSL/TLS → Origin Server → **Create certificate** for
   `<domain>, *.<domain>`. On the VPS save the two parts as
   `/etc/ssl/cloudflare/demo-origin.pem` and `.key` (`chmod 600`).
4. Deploy the live site at or after the commit that added this doc (Caddy
   needs the new mounts).
5. `bash /srv/bzaro/app/deploy/setup-demo.sh <domain>` — database, .env with
   its own secrets, Caddy site, first release, seed (plans, categories, PIN
   codes, six showcase sellers). Seller logins: `/root/bzaro-demo-credentials.txt`.

## Test payments

Sign in to a showcase seller (credentials file) → Settings → Payments → paste
the **Razorpay TEST** Key ID / Secret (`rzp_test_…`) and a webhook secret.
In the demo's admin → Sellers → that seller → switch **Payments** on. Priced
products then show **Add to cart**; pay with Razorpay's test cards. No real
money moves. Leave Shiprocket off — it has no test mode.

## Day to day

    BZARO_ENV=demo bash /srv/bzaro-demo/app/deploy/deploy.sh      # after a push
    BZARO_ENV=demo bash /srv/bzaro-demo/app/deploy/rollback.sh    # back one release
    cd /srv/bzaro-demo/app && npm run db:seed:showcase            # refresh samples

The demo shares the Redis used for rate limiting, so an IP's counters are
shared across both sites. Scheduled jobs (analytics roll-ups) do not run on
the demo.
