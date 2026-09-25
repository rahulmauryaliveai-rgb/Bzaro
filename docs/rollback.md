# Rollback — bzaro.in production

Written for the real setup: Caddy (Docker, host network) in front of pm2
(`bzaro-web` + `bzaro-worker`), Postgres in Docker (`bzaro-postgres`),
Cloudflare proxied DNS. **Do not run any of this without a reason** — each step
says when it applies. Work top-down and stop at the first step that fixes it.

> Paths below assume the release layout (`/srv/bzaro/current` → a folder in
> `/srv/bzaro/releases/`). Until that migration is done the app lives in
> `/srv/bzaro/app` and step 1 is "redeploy the previous commit" instead.

## 0. First, look

```bash
pm2 status                                  # both online? restart counts climbing?
pm2 logs bzaro-web --lines 80 --nostream    # the actual error
docker ps --format '{{.Names}}\t{{.Status}}' # caddy, postgres, redis up?
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: bzaro.in" http://127.0.0.1:3000/
```

## 1. Bad code (app errors, site 500s) — seconds

Release layout:
```bash
APP=/srv/bzaro
PREV=$(ls -1dt $APP/releases/* | sed -n 2p)      # the release before current
ln -sfn "$PREV" $APP/current.new && mv -Tf $APP/current.new $APP/current
pm2 startOrReload $APP/shared/ecosystem.config.cjs --update-env && pm2 save
```

Current in-place layout (`/srv/bzaro/app`):
```bash
cd /srv/bzaro/app && git log --oneline -5          # pick the last good commit
git reset --hard <good-sha> && npm ci && npm run build && pm2 reload all --update-env
```

A migration that already ran is NOT undone by this — see step 3. Our
migrations are additive (expand-contract), so old code runs on the new schema.

## 2. Bad Caddy config (every host down, TLS errors, 502 from Cloudflare)

```bash
cd /srv/bzaro/app
cp /root/backups/Caddyfile.<date> deploy/Caddyfile          # last known good
docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v deploy_caddy-data:/data -e ROOT_DOMAIN=bzaro.in -e ACME_EMAIL=x@y.z \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --force-recreate caddy
```

If Authenticated Origin Pulls was just switched on and bzaro.in shows
Cloudflare 525/526 errors: turn AOP **off** in Cloudflare (SSL/TLS → Origin
Server) first — that alone restores traffic — then fix the Caddyfile.

## 3. Failed migration

```bash
cd /srv/bzaro/current   # or /srv/bzaro/app
npx prisma migrate status
# Partially applied: fix forward with a new migration, or mark it rolled back
# (only after reverting its SQL by hand):
npx prisma migrate resolve --rolled-back <migration_name>
```
Never `prisma migrate reset` or `migrate dev` on production.

## 4. Database restore — only if old code cannot run on the new schema

Loses every write since the dump. Stop the app first.

```bash
pm2 stop bzaro-web bzaro-worker
ls -lt ~/backups/*.dump | head                    # newest pre-deploy dump
docker exec -i bzaro-postgres pg_restore -U bzaro -d bzaro \
  --clean --if-exists --no-owner < ~/backups/<pre-deploy>.dump
pm2 start bzaro-web bzaro-worker
```
(Plain-SQL dumps such as `/root/bzaro-before-phase1-7.sql` restore with
`docker exec -i bzaro-postgres psql -U bzaro -d bzaro < file.sql` into an
EMPTY database.)

## 5. Environment

```bash
cp ~/backups/env.<date> /srv/bzaro/shared/.env   # or /srv/bzaro/app/.env
chmod 600 /srv/bzaro/shared/.env
pm2 reload all --update-env
```
`NEXT_PUBLIC_*` values are baked in at build time — changing them needs a rebuild.

## 6. Cloudflare

- Site unreachable after an SSL change → SSL/TLS mode back to **Full**.
- Webhooks challenged → check the "Skip webhooks" WAF rule is still first.
- Last resort for an origin problem: DNS records to DNS-only (grey) — only if
  the origin's own certificates are valid for those hosts (apex: Let's
  Encrypt; `*.bzaro.in` origin cert is NOT browser-trusted, so stores break).

## 7. Last resort — Hostinger snapshot

hPanel → VPS → Snapshots → restore the snapshot taken before the deploy.
Reverts the WHOLE server (code, database, config) to that moment; everything
since is lost. Take a fresh `pg_dump` first if the database is readable.
