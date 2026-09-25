#!/usr/bin/env bash
# Deploy origin/main to this VPS as a new release (docs/HOSTINGER.md §5).
#
#   bash /srv/bzaro/app/deploy/deploy.sh
#
# Layout (one-time conversion: deploy/migrate-to-releases.sh):
#
#   /srv/bzaro/repo              git clone; fetched, never built in
#   /srv/bzaro/releases/<id>     one exported commit each, built in place
#   /srv/bzaro/shared/.env       app secrets        → releases/<id>/.env
#   /srv/bzaro/shared/deploy.env compose secrets    → releases/<id>/deploy/.env
#   /srv/bzaro/shared/uploads    seller uploads     → releases/<id>/public/uploads
#   /srv/bzaro/shared/Caddyfile  the file Caddy mounts (copied from the release)
#   /srv/bzaro/app               symlink → the live release
#
# Everything that says /srv/bzaro/app (pm2 cwd, cron, docs) keeps working
# because that path is now the symlink.
#
# Order: export → install → migrate → build (old release still serving) →
# validate Caddyfile → switch symlink → reload Caddy + pm2 → smoke test →
# prune. If the smoke test fails the symlink goes back to the previous release
# automatically. Migrations are NOT reversed by that — they are expand-contract
# (docs/DEPLOYMENT.md §5), so the previous code runs on the new schema.
#
# Env knobs:
#   BRANCH=main                      branch to deploy
#   KEEP_RELEASES=5                  releases kept on disk (min 2)
#   ALLOW_DESTRUCTIVE_MIGRATION=1    see the migration guard below
#   FORCE=1                          redeploy even if that commit is already live
#   BZARO_ENV=demo                   deploy the sales demo instead (below)
#
# The sales demo (deploy/setup-demo.sh) is a second copy of the app on this
# server: /srv/bzaro-demo, database bzaro_demo, pm2 apps bzaro-demo-* on port
# 3001. It shares the git clone and Caddy with the live site; Caddy stays
# owned by the live deploy.
set -euo pipefail

ENVIRONMENT=${BZARO_ENV:-live}
case "$ENVIRONMENT" in
  live) DEFAULT_BASE=/srv/bzaro; APP_PORT=3000; DB_NAME=bzaro; ECOSYSTEM=deploy/ecosystem.config.cjs; MANAGE_CADDY=1 ;;
  demo) DEFAULT_BASE=/srv/bzaro-demo; APP_PORT=3001; DB_NAME=bzaro_demo; ECOSYSTEM=deploy/ecosystem.demo.config.cjs; MANAGE_CADDY=0 ;;
  *) echo "✗ BZARO_ENV must be live or demo" >&2; exit 2 ;;
esac
BASE=${BZARO_BASE:-$DEFAULT_BASE}   # BZARO_BASE: only for testing the scripts
if [[ "$ENVIRONMENT" == demo ]]; then
  REPO=${BZARO_REPO:-/srv/bzaro/repo}
else
  REPO=${BZARO_REPO:-$BASE/repo}
fi
RELEASES=$BASE/releases
SHARED=$BASE/shared
CURRENT=$BASE/app
BRANCH=${BRANCH:-main}
KEEP=${KEEP_RELEASES:-5}
(( KEEP < 2 )) && KEEP=2
PG=bzaro-postgres

die() { echo "✗ $*" >&2; exit 1; }

# ── Preconditions ────────────────────────────────────────────────────────────
if [[ -e "$CURRENT" && ! -L "$CURRENT" ]]; then
  die "$CURRENT is a plain directory (old layout) — convert it once with deploy/migrate-to-releases.sh"
fi
[[ -d "$REPO/.git" ]] || die "$REPO is missing — see deploy/migrate-to-releases.sh"
[[ -f "$SHARED/.env" ]] || die "$SHARED/.env is missing"
if (( MANAGE_CADDY )); then
  for f in deploy.env Caddyfile; do
    [[ -f "$SHARED/$f" ]] || die "$SHARED/$f is missing"
  done
fi
[[ -d "$SHARED/uploads" ]] || die "$SHARED/uploads is missing"

# Empty on the very first deploy of a fresh server (deploy/setup-vps.sh).
PREV=""
[[ -L "$CURRENT" ]] && PREV=$(readlink -f "$CURRENT")

echo "→ fetching origin/$BRANCH"
git -C "$REPO" fetch --quiet origin "$BRANCH"
SHA=$(git -C "$REPO" rev-parse --short=7 "origin/$BRANCH")
SUBJECT=$(git -C "$REPO" log -1 --format='%s' "origin/$BRANCH")
echo "   origin/$BRANCH = $SHA $SUBJECT"

if [[ -n "$PREV" && -f "$PREV/REVISION" && "$(cut -d' ' -f1 "$PREV/REVISION")" == "$SHA" && "${FORCE:-}" != "1" ]]; then
  echo "✓ $SHA is already live ($(basename "$PREV")). FORCE=1 to rebuild it anyway."
  exit 0
fi

# Release ids sort by time. Never reuse the newest one's second, or the two
# would sort by sha instead (possible right after migrate-to-releases.sh).
LATEST=$(ls -1 "$RELEASES" | sort | tail -1)
ID="$(date -u +%Y%m%d-%H%M%S)-$SHA"
if [[ -n "$LATEST" && "${ID:0:15}" == "${LATEST:0:15}" ]]; then
  sleep 1
  ID="$(date -u +%Y%m%d-%H%M%S)-$SHA"
fi
NEW="$RELEASES/$ID"
mkdir -p "$NEW"

# A failed build must not leave a half-built directory that prune could later
# mistake for a good release.
SWITCHED=0
cleanup() {
  local code=$?
  if (( code != 0 && SWITCHED == 0 )); then
    echo "   removing unfinished release $ID" >&2
    rm -rf "$NEW"
  fi
}
trap cleanup EXIT

echo "→ exporting $SHA to releases/$ID"
git -C "$REPO" archive "origin/$BRANCH" | tar -x -C "$NEW"
echo "$SHA $SUBJECT" > "$NEW/REVISION"

ln -s "$SHARED/.env"       "$NEW/.env"
[[ -f "$SHARED/deploy.env" ]] && ln -s "$SHARED/deploy.env" "$NEW/deploy/.env"
# public/uploads is linked to shared/uploads only AFTER the build. Turbopack
# aborts on a symlink that leaves the project root ("points out of the
# filesystem root") when it traces the upload route, so it builds against an
# empty directory.
mkdir -p "$NEW/public/uploads"

cd "$NEW"

echo "→ installing dependencies"
HUSKY=0 npm ci --no-audit --no-fund

echo "→ generating Prisma client"
npx prisma generate

# ── Destructive-migration guard ─────────────────────────────────────────────
# `prisma migrate deploy` never asks. A migration that drops a table or deletes
# rows is therefore one keystroke away from being irreversible on live data.
# Work out which migrations are pending, look for destructive SQL in them, and
# refuse unless the operator has said they mean it:
#   ALLOW_DESTRUCTIVE_MIGRATION=1 bash /srv/bzaro/app/deploy/deploy.sh
echo "→ checking pending migrations"
DESTRUCTIVE_RE='DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM'

HAS_TABLE=$(docker exec "$PG" psql -U bzaro -d "$DB_NAME" -tAc \
  "SELECT to_regclass('public._prisma_migrations') IS NOT NULL" 2>/dev/null || echo "unreachable")
[[ "$HAS_TABLE" == "unreachable" ]] && die "cannot reach $PG to check which migrations are applied"

if [[ "$HAS_TABLE" == "t" ]]; then
  APPLIED=$(docker exec "$PG" psql -U bzaro -d "$DB_NAME" -tAc \
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
    echo "    docker exec $PG pg_dump -U bzaro -Fc $DB_NAME > /root/backups/$DB_NAME-\$(date +%Y%m%d-%H%M).dump" >&2
    echo "  Then re-run:  ALLOW_DESTRUCTIVE_MIGRATION=1 bash $CURRENT/deploy/deploy.sh" >&2
    exit 1
  fi
  [[ -n "$OFFENDERS" ]] && echo "   ⚠ applying a DESTRUCTIVE migration because ALLOW_DESTRUCTIVE_MIGRATION=1"
fi

echo "→ applying migrations"
npx prisma migrate deploy

echo "→ building (the live release keeps serving meanwhile)"
NODE_OPTIONS="--max-old-space-size=3072" npm run build

rmdir "$NEW/public/uploads" 2>/dev/null \
  || die "the build wrote files into public/uploads — not replacing it with the shared link"
ln -s "$SHARED/uploads" "$NEW/public/uploads"

# Validate against the running Caddy: it has ROOT_DOMAIN and /data/cloudflare/*.
if (( MANAGE_CADDY )); then
echo "→ validating Caddyfile"
if [[ "$(docker inspect -f '{{.State.Running}}' bzaro-caddy 2>/dev/null)" == "true" ]]; then
  docker exec -i bzaro-caddy caddy validate --adapter caddyfile --config /dev/stdin \
    < deploy/Caddyfile >/dev/null 2>&1 \
    || die "deploy/Caddyfile does not validate — nothing switched. Check: docker exec -i bzaro-caddy caddy validate --adapter caddyfile --config /dev/stdin < $NEW/deploy/Caddyfile"
else
  echo "   ⚠ bzaro-caddy is not running — skipped (first deploy?)"
fi
fi

# ── Switch ───────────────────────────────────────────────────────────────────
switch_to() {
  ln -sfn "$1" "$BASE/.app.next"
  mv -Tf "$BASE/.app.next" "$CURRENT"
}

reload_processes() {
  mkdir -p "${BZARO_LOG_DIR:-/var/log/bzaro}"
  (cd "$CURRENT" && pm2 startOrReload "$ECOSYSTEM" --update-env)
  pm2 save >/dev/null
}

smoke_test() {
  local host
  host=$(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' "$SHARED/.env" | cut -d= -f2 | tr -d "\"'")
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null -H "Host: $host" "http://127.0.0.1:$APP_PORT/" && return 0
    sleep 2
  done
  return 1
}

echo "→ switching $CURRENT → releases/$ID"
switch_to "$NEW"
SWITCHED=1

if (( MANAGE_CADDY )); then
# Caddy mounts shared/Caddyfile. Rewrite it in place (same inode, so the bind
# mount sees it) and reload gracefully; no container restart, no TLS blip.
if ! cmp -s deploy/Caddyfile "$SHARED/Caddyfile"; then
  echo "→ Caddyfile changed — reloading Caddy"
  cp "$SHARED/Caddyfile" "$SHARED/Caddyfile.prev"
  cat deploy/Caddyfile > "$SHARED/Caddyfile"
  docker exec bzaro-caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile \
    || echo "   ⚠ caddy reload failed — check: docker logs --tail 50 bzaro-caddy" >&2
fi
# Only recreates Caddy if compose.yml changed its definition; a no-op otherwise.
docker compose --env-file "$SHARED/deploy.env" -f "$NEW/deploy/compose.yml" up -d --no-deps caddy --quiet-pull >/dev/null
fi

echo "→ reloading processes"
reload_processes

echo "→ smoke test"
if ! smoke_test; then
  if [[ -z "$PREV" ]]; then
    echo "✗ new release did not answer on :$APP_PORT and there is no previous release — check: pm2 logs bzaro-web" >&2
    exit 1
  fi
  echo "✗ new release did not answer on :$APP_PORT — rolling back to $(basename "$PREV")" >&2
  switch_to "$PREV"
  if (( MANAGE_CADDY )) && [[ -f "$SHARED/Caddyfile.prev" ]] && ! cmp -s "$PREV/deploy/Caddyfile" "$SHARED/Caddyfile"; then
    cat "$PREV/deploy/Caddyfile" > "$SHARED/Caddyfile"
    docker exec bzaro-caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile || true
  fi
  reload_processes
  smoke_test && echo "   previous release is serving again" >&2 || echo "   ✗ previous release is not answering either — check: pm2 logs bzaro-web" >&2
  touch "$NEW/FAILED"   # rollback.sh never picks it
  echo "   failed release kept for inspection: $NEW" >&2
  exit 1
fi
echo "✓ live: $SHA ($ID)"

# ── Prune ────────────────────────────────────────────────────────────────────
# Keep the newest $KEEP releases, and never the live one or the one before it.
mapfile -t ALL < <(ls -1 "$RELEASES" | sort -r)
for (( i = KEEP; i < ${#ALL[@]}; i++ )); do
  dir="$RELEASES/${ALL[$i]}"
  [[ "$dir" == "$NEW" || "$dir" == "$PREV" ]] && continue
  echo "   pruning ${ALL[$i]}"
  rm -rf "$dir"
done
