# Rollback — bzaro.in production

Written for the real setup: Caddy (Docker, host network) in front of pm2
(`bzaro-web` + `bzaro-worker`), Postgres in Docker (`bzaro-postgres`),
Cloudflare proxied DNS. **Do not run any of this without a reason** — each step
says when it applies. Work top-down and stop at the first step that fixes it.

> Layout (deploy/deploy.sh): `/srv/bzaro/app` is a **symlink** to the live
> folder in `/srv/bzaro/releases/`. Secrets, uploads and the Caddyfile Caddy
> mounts live in `/srv/bzaro/shared/`. `/srv/bzaro/repo` is the git clone.
> The last 5 releases stay on disk. `/srv/bzaro/app` has no `.git` — use
> `cat /srv/bzaro/app/REVISION` to see what is live.

## 0. First, look

```bash
pm2 status                                  # both online? restart counts climbing?
pm2 logs bzaro-web --lines 80 --nostream    # the actual error
docker ps --format '{{.Names}}\t{{.Status}}' # caddy, postgres, redis up?
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: bzaro.in" http://127.0.0.1:3000/
```

## 1. Bad code (app errors, site 500s) — seconds

```bash
bash /srv/bzaro/app/deploy/rollback.sh --list    # → marks the live one
bash /srv/bzaro/app/deploy/rollback.sh           # back one release (seconds, no rebuild)
bash /srv/bzaro/app/deploy/rollback.sh <id>      # or a specific one
```
It switches the symlink, restores that release's Caddyfile if it differs,
reloads pm2 and smoke-tests. deploy.sh already does this automatically when a
new release fails its smoke test. Moving forward again = the next deploy.sh.

By hand, if the script itself is broken:
```bash
ln -sfn /srv/bzaro/releases/<id> /srv/bzaro/.app.next && mv -Tf /srv/bzaro/.app.next /srv/bzaro/app
cd /srv/bzaro/app && pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save
```

A migration that already ran is NOT undone by this — see step 3. Our
migrations are additive (expand-contract), so old code runs on the new schema.

## 2. Bad Caddy config (every host down, TLS errors, 502 from Cloudflare)

Caddy mounts `/srv/bzaro/shared/Caddyfile`. deploy.sh keeps the previous one
as `shared/Caddyfile.prev`.
```bash
F=/root/backups/Caddyfile.<date>      # or /srv/bzaro/shared/Caddyfile.prev
docker exec -i bzaro-caddy caddy validate --adapter caddyfile --config /dev/stdin < "$F"
cat "$F" > /srv/bzaro/shared/Caddyfile            # in place: the mount keeps working
docker exec bzaro-caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
```
If Caddy is not running at all:
`docker compose --env-file /srv/bzaro/shared/deploy.env -f /srv/bzaro/app/deploy/compose.yml up -d --force-recreate caddy`

If Authenticated Origin Pulls was just switched on and bzaro.in shows
Cloudflare 525/526 errors: turn AOP **off** in Cloudflare (SSL/TLS → Origin
Server) first — that alone restores traffic — then fix the Caddyfile.

## 3. Failed migration

```bash
cd /srv/bzaro/app
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
cp ~/backups/env.<date> /srv/bzaro/shared/.env   # every release links to this file
chmod 600 /srv/bzaro/shared/.env
pm2 restart bzaro-web bzaro-worker --update-env
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
