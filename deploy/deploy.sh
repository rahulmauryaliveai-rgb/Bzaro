#!/usr/bin/env bash
# Deploy the current origin/main to this VPS (docs/HOSTINGER.md §5).
#
#   bash /srv/bzaro/app/deploy/deploy.sh
#
# Pull → install → migrate → build → reload pm2 → smoke test. Migrations run
# BEFORE the new code starts (expand-contract, docs/DEPLOYMENT.md §5). The
# build writes .next in place, so expect a short blip while it runs.
set -euo pipefail

APP=/srv/bzaro/app
BRANCH=${BRANCH:-main}

cd "$APP"

if [[ ! -f .env ]]; then
  echo "✗ $APP/.env is missing — copy deploy/env.production.example and fill it in" >&2
  exit 1
fi

echo "→ fetching origin/$BRANCH"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
echo "   at $(git log -1 --format='%h %s')"

echo "→ installing dependencies"
npm ci --no-audit --no-fund

echo "→ generating Prisma client"
npx prisma generate

echo "→ applying migrations"
npx prisma migrate deploy

echo "→ building (this is the slow step)"
NODE_OPTIONS="--max-old-space-size=3072" npm run build

echo "→ refreshing infrastructure (picks up Caddyfile/compose changes; no-op otherwise)"
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --force-recreate caddy --quiet-pull >/dev/null 2>&1 || echo "   (caddy not recreated — run compose up manually)"

echo "→ reloading processes"
mkdir -p /var/log/bzaro public/uploads
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "→ smoke test"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -H "Host: $(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' .env | cut -d= -f2 | tr -d '"')" http://127.0.0.1:3000/; then
    echo "✓ live: $(git log -1 --format='%h')"
    exit 0
  fi
  sleep 2
done

echo "✗ app did not answer on :3000 — check: pm2 logs bzaro-web" >&2
exit 1
