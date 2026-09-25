#!/usr/bin/env bash
# Point /srv/bzaro/app back at an earlier release (docs/rollback.md §1).
#
#   bash /srv/bzaro/app/deploy/rollback.sh            # the release before the live one
#   bash /srv/bzaro/app/deploy/rollback.sh --list     # show releases
#   bash /srv/bzaro/app/deploy/rollback.sh <id>       # a specific one
#
# Code only. Database migrations are not reversed: they are expand-contract
# (docs/DEPLOYMENT.md §5), so older code runs on the newer schema. The next
# deploy.sh run moves forward again as usual.
set -euo pipefail

BASE=${BZARO_BASE:-/srv/bzaro}   # overridable only for testing the scripts
RELEASES=$BASE/releases
SHARED=$BASE/shared
CURRENT=$BASE/app

die() { echo "✗ $*" >&2; exit 1; }
[[ -L "$CURRENT" ]] || die "$CURRENT is not a symlink — release layout not in use"

LIVE=$(basename "$(readlink -f "$CURRENT")")
mapfile -t ALL < <(ls -1 "$RELEASES" | sort -r)

if [[ "${1:-}" == "--list" ]]; then
  for r in "${ALL[@]}"; do
    mark="  "; [[ "$r" == "$LIVE" ]] && mark="→ "
    note=""; [[ -f "$RELEASES/$r/FAILED" ]] && note="  (failed smoke test)"
    printf '%s%s  %s%s\n' "$mark" "$r" "$(cat "$RELEASES/$r/REVISION" 2>/dev/null || echo '?')" "$note"
  done
  exit 0
fi

TARGET=${1:-}
if [[ -z "$TARGET" ]]; then
  for (( i = 0; i < ${#ALL[@]}; i++ )); do
    [[ "${ALL[$i]}" == "$LIVE" ]] || continue
    for (( j = i + 1; j < ${#ALL[@]}; j++ )); do
      [[ -f "$RELEASES/${ALL[$j]}/FAILED" ]] || { TARGET=${ALL[$j]}; break; }
    done
    break
  done
  [[ -n "$TARGET" ]] || die "no release older than $LIVE"
fi
[[ -d "$RELEASES/$TARGET/.next" ]] || die "releases/$TARGET does not exist or was never built"
[[ "$TARGET" == "$LIVE" ]] && die "$TARGET is already live"
[[ -f "$RELEASES/$TARGET/FAILED" ]] && die "$TARGET failed its smoke test when deployed — pick another (--list)"

echo "→ $LIVE  ⇒  $TARGET ($(cat "$RELEASES/$TARGET/REVISION" 2>/dev/null || echo '?'))"
ln -sfn "$RELEASES/$TARGET" "$BASE/.app.next"
mv -Tf "$BASE/.app.next" "$CURRENT"

if ! cmp -s "$RELEASES/$TARGET/deploy/Caddyfile" "$SHARED/Caddyfile"; then
  echo "→ restoring that release's Caddyfile"
  docker exec -i bzaro-caddy caddy validate --adapter caddyfile --config /dev/stdin \
    < "$RELEASES/$TARGET/deploy/Caddyfile" >/dev/null 2>&1 || die "its Caddyfile does not validate — symlink switched, Caddy left as is"
  cat "$RELEASES/$TARGET/deploy/Caddyfile" > "$SHARED/Caddyfile"
  docker exec bzaro-caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
fi

(cd "$CURRENT" && pm2 startOrReload deploy/ecosystem.config.cjs --update-env)
pm2 save >/dev/null

host=$(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' "$SHARED/.env" | cut -d= -f2 | tr -d "\"'")
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -H "Host: $host" http://127.0.0.1:3000/; then
    echo "✓ live: $TARGET"; exit 0
  fi
  sleep 2
done
die "app did not answer on :3000 — check: pm2 logs bzaro-web"
