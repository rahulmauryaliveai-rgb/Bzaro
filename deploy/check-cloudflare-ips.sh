#!/usr/bin/env bash
# Warn when Cloudflare's published IP ranges differ from the list in
# deploy/Caddyfile (trusted_proxies). Read-only: it never edits or reloads
# anything — a changed list is a reviewed commit, not a cron side effect.
#
#   /etc/cron.d/bzaro-cf-ips:
#   0 4 * * 1 root bash /srv/bzaro/app/deploy/check-cloudflare-ips.sh >> /var/log/bzaro/cf-ips.log 2>&1
set -euo pipefail
CADDYFILE=${1:-/srv/bzaro/app/deploy/Caddyfile}

live=$( { curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } \
  | tr -s ' \n' '\n' | sed '/^$/d' | sort -u)
[[ -n "$live" ]] || { echo "$(date -u +%FT%TZ) ✗ could not download Cloudflare ranges"; exit 1; }

ours=$(grep -m1 'trusted_proxies static' "$CADDYFILE" | sed 's/.*trusted_proxies static//' \
  | tr -s ' \t' '\n' | sed '/^$/d' | sort -u)

if [[ "$live" == "$ours" ]]; then
  echo "$(date -u +%FT%TZ) ✓ Cloudflare ranges unchanged"
else
  echo "$(date -u +%FT%TZ) ⚠ Cloudflare ranges CHANGED — update trusted_proxies in deploy/Caddyfile:"
  diff <(echo "$ours") <(echo "$live") || true
  exit 2
fi
