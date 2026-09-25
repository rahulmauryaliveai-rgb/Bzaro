#!/usr/bin/env bash
# ONE-TIME: convert /srv/bzaro/app (a plain git checkout) into the release
# layout deploy/deploy.sh expects. Safe to read; dry-run first:
#
#   git -C /srv/bzaro/app fetch -q origin main
#   git -C /srv/bzaro/app show origin/main:deploy/migrate-to-releases.sh > /root/migrate-to-releases.sh
#   bash /root/migrate-to-releases.sh --dry-run
#   bash /root/migrate-to-releases.sh
#
# What it does (nothing is deleted):
#   1. /srv/bzaro/repo            ← copy of app/.git (same remote + credentials)
#   2. /srv/bzaro/shared/.env, deploy.env, Caddyfile ← copies (mode kept)
#   3. /srv/bzaro/shared/uploads  ← app/public/uploads is MOVED (a rename:
#      instant, and Caddy's existing mount follows the directory)
#   4. app/.env, app/deploy/.env, app/public/uploads → symlinks into shared/
#   5. /srv/bzaro/app → /srv/bzaro/releases/<utc>-<sha>, and /srv/bzaro/app
#      becomes a symlink to it. Running processes keep working: they hold the
#      directory, not its name.
#   6. With --deploy: runs the new deploy/deploy.sh from repo/, which builds
#      origin/main as the second release, recreates Caddy on the stable mounts
#      and reloads pm2.
#
# Undo (before any new release exists):
#   rm /srv/bzaro/app && mv /srv/bzaro/releases/<id> /srv/bzaro/app
#   then restore app/.env, app/deploy/.env and app/public/uploads from shared/
#   (they are symlinks at that point: replace each with the real file/dir).
set -euo pipefail

BASE=${BZARO_BASE:-/srv/bzaro}   # overridable only for testing the scripts
APP=$BASE/app
REPO=$BASE/repo
RELEASES=$BASE/releases
SHARED=$BASE/shared

DRY=0; DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --deploy)  DEPLOY=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

run() { echo "  + $*"; (( DRY )) || "$@"; }
die() { echo "✗ $*" >&2; exit 1; }

[[ $EUID -eq 0 || -n "${BZARO_BASE:-}" ]] || die "run as root"
[[ -L "$APP" ]] && { echo "✓ $APP is already a symlink → $(readlink -f "$APP"). Nothing to do."; exit 0; }
[[ -d "$APP/.git" ]] || die "$APP is not a git checkout"
[[ -e "$REPO" ]] && die "$REPO already exists — remove or rename it first"
[[ -e "$SHARED/.env" ]] && die "$SHARED/.env already exists — a previous run got part-way; finish by hand"
[[ -f "$APP/.env" && ! -L "$APP/.env" ]] || die "$APP/.env missing"
[[ -f "$APP/deploy/.env" && ! -L "$APP/deploy/.env" ]] || die "$APP/deploy/.env missing"
[[ -d "$APP/.next" ]] || die "$APP/.next missing — the current release was never built"
if [[ -n "$(git -C "$APP" status --porcelain --untracked-files=no)" ]]; then
  git -C "$APP" status --short --untracked-files=no >&2
  die "tracked files in $APP are modified — commit or discard them first"
fi

SHA=$(git -C "$APP" rev-parse --short=7 HEAD)
SUBJECT=$(git -C "$APP" log -1 --format=%s)
# Named after the commit's own time, so it always sorts before the release
# deploy.sh builds next.
ID="$(TZ=UTC git -C "$APP" log -1 --format=%cd --date=format-local:%Y%m%d-%H%M%S)-$SHA"
FREE_GB=$(df -BG --output=avail "$BASE" | tail -1 | tr -dc 0-9)

echo "Current checkout : $APP at $SHA $SUBJECT"
echo "Becomes release  : $RELEASES/$ID"
echo "Free disk        : ${FREE_GB}G (each release ≈ 1.6G; 5 kept)"
(( FREE_GB >= ${MIN_FREE_GB:-10} )) || die "less than ${MIN_FREE_GB:-10}G free"
(( DRY )) && echo "DRY RUN — commands below are printed, not run:"

echo "→ 1. repo"
run mkdir -p "$REPO"
run cp -a "$APP/.git" "$REPO/.git"
run git -C "$REPO" fetch -q origin main
run git -C "$REPO" checkout -q -f -B main origin/main

echo "→ 2. shared files"
run mkdir -p "$SHARED" "$RELEASES"
run chmod 755 "$SHARED" "$RELEASES"
run cp -a "$APP/.env"            "$SHARED/.env"
run cp -a "$APP/deploy/.env"     "$SHARED/deploy.env"
run cp -a "$APP/deploy/Caddyfile" "$SHARED/Caddyfile"
run chmod 600 "$SHARED/.env" "$SHARED/deploy.env"

echo "→ 3. uploads"
if [[ -d "$APP/public/uploads" && ! -L "$APP/public/uploads" ]]; then
  run mv "$APP/public/uploads" "$SHARED/uploads"
else
  run mkdir -p "$SHARED/uploads"
fi

echo "→ 4. symlinks inside the current checkout"
run ln -sfn "$SHARED/uploads" "$APP/public/uploads"
run ln -sfn "$SHARED/.env" "$APP/.env.migrating"
run mv -Tf "$APP/.env.migrating" "$APP/.env"
run ln -sfn "$SHARED/deploy.env" "$APP/deploy/.env.migrating"
run mv -Tf "$APP/deploy/.env.migrating" "$APP/deploy/.env"
if (( DRY )); then
  echo "  + echo \"$SHA $SUBJECT\" > $APP/REVISION"
else
  echo "$SHA $SUBJECT" > "$APP/REVISION"
fi

echo "→ 5. move into releases/ and link"
run mv "$APP" "$RELEASES/$ID"
run ln -s "$RELEASES/$ID" "$APP"

if (( DRY )); then
  echo "✓ dry run finished — nothing changed."
  exit 0
fi

echo "→ checks"
readlink -f "$APP"
[[ -f "$APP/.env" ]] && echo "  .env reachable through the symlink"
curl -s -o /dev/null -w "  https://$(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' "$SHARED/.env" | cut -d= -f2 | tr -d "\"'")/ %{http_code}\n" \
  "https://$(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' "$SHARED/.env" | cut -d= -f2 | tr -d "\"'")/"
echo "✓ layout converted. The site is still served by the same processes."

if (( DEPLOY )); then
  echo "→ 6. first release deploy"
  exec bash "$REPO/deploy/deploy.sh"
else
  echo "Next: bash $REPO/deploy/deploy.sh"
  echo "(From then on always: bash $APP/deploy/deploy.sh)"
fi
