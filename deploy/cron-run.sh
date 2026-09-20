#!/usr/bin/env bash
# Invoke one scheduled job on the local app (docs/DEPLOYMENT.md §6).
#
#   bash /srv/bzaro/app/deploy/cron-run.sh refresh-counters
#
# Installed by deploy/crontab; replaces Vercel Cron. The response body is the
# job's own report of what changed, so it is logged in full.
set -euo pipefail

JOB=${1:?job name, e.g. rollup-analytics}
APP=/srv/bzaro/app
ENV_FILE="$APP/.env"

secret=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
host=$(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")

if [[ -z "$secret" ]]; then
  echo "CRON_SECRET is not set in $ENV_FILE" >&2
  exit 1
fi

printf '%s %s ' "$(date -Is)" "$JOB"
curl -sS --max-time 600 \
  -H "Authorization: Bearer $secret" \
  -H "Host: $host" \
  "http://127.0.0.1:3000/api/cron/$JOB"
echo
