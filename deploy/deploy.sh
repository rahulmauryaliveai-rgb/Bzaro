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

# ── Destructive-migration guard ─────────────────────────────────────────────
# `prisma migrate deploy` never asks. A migration that drops a table or deletes
# rows is therefore one keystroke away from being irreversible on live data,
# and deploy/env.production.example ships with no backup configured.
#
# So: work out which migrations are pending, look for destructive SQL in them,
# and refuse unless the operator has said they mean it. Override with
#   ALLOW_DESTRUCTIVE_MIGRATION=1 bash deploy/deploy.sh
echo "→ checking pending migrations"
DESTRUCTIVE_RE='DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM'
PG=bzaro-postgres

# A database with no _prisma_migrations table is a fresh one: nothing to lose,
# so the guard stays out of the way of a first deploy.
HAS_TABLE=$(docker exec "$PG" psql -U bzaro -d bzaro -tAc \
  "SELECT to_regclass('public._prisma_migrations') IS NOT NULL" 2>/dev/null || echo "unreachable")

if [[ "$HAS_TABLE" == "unreachable" ]]; then
  echo "✗ cannot reach $PG to check which migrations are already applied." >&2
  echo "  The deploy would fail at the migrate step anyway — fix the database first." >&2
  exit 1
fi

if [[ "$HAS_TABLE" == "t" ]]; then
  APPLIED=$(docker exec "$PG" psql -U bzaro -d bzaro -tAc \
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL' 2>/dev/null || true)

  OFFENDERS=""
  for dir in prisma/migrations/*/; do
    name=$(basename "$dir")
    if grep -qxF "$name" <<<"$APPLIED"; then continue; fi

    hits=$(grep -inE "$DESTRUCTIVE_RE" "$dir/migration.sql" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
      OFFENDERS+="  $name"$'\n'"$(sed 's/^/      /' <<<"$hits")"$'\n'
    else
      echo "   pending: $name"
    fi
  done

  if [[ -n "$OFFENDERS" && "${ALLOW_DESTRUCTIVE_MIGRATION:-}" != "1" ]]; then
    echo "" >&2
    echo "✗ a pending migration destroys data:" >&2
    echo "$OFFENDERS" >&2
    echo "  Back up first:" >&2
    echo "    docker exec $PG pg_dump -U bzaro bzaro > ~/bzaro-\$(date +%F-%H%M).sql" >&2
    echo "" >&2
    echo "  Then re-run:  ALLOW_DESTRUCTIVE_MIGRATION=1 bash deploy/deploy.sh" >&2
    exit 1
  fi

  if [[ -n "$OFFENDERS" ]]; then
    echo "   ⚠ applying a DESTRUCTIVE migration because ALLOW_DESTRUCTIVE_MIGRATION=1"
  fi
fi

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
