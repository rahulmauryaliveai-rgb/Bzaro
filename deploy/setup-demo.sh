#!/usr/bin/env bash
# One-time: stand up the SALES DEMO copy of Bzaro next to the live site.
#
#   bash /srv/bzaro/app/deploy/setup-demo.sh <demo-domain>      e.g. bzarodemo.in
#
# What it builds (nothing of the live site is touched except one Caddy reload):
#   /srv/bzaro-demo/{releases,shared}   same release layout as the live site
#   database bzaro_demo                 in the same Postgres container
#   shared/.env                         copied from the live .env with its OWN
#                                       secrets, domain and database; Google
#                                       sign-in, Turnstile and WhatsApp removed;
#                                       NEXT_PUBLIC_DEMO_MODE=1 (banner)
#   /srv/bzaro/shared/caddy-sites/demo.caddy   routes the domain to :3001,
#                                       noindex on every response
# then deploys origin/main as the demo's first release and seeds it: plans,
# categories, admin (same ADMIN_EMAIL/PASSWORD as live), all PIN codes and the
# six showcase sellers. Their logins go to /root/bzaro-demo-credentials.txt.
#
# Before running (see docs/DEMO.md):
#   1. the domain is on Cloudflare: A @ and * -> this server, proxied;
#      SSL Full (strict); Authenticated Origin Pulls ON
#   2. a Cloudflare Origin Certificate for "<domain>, *.<domain>" saved as
#      /etc/ssl/cloudflare/demo-origin.pem and .key (chmod 600)
#   3. the live site deployed at or after the commit that added this script
#      (Caddy needs the sites/ mount and the parameterised app snippet)
#
# Safe to re-run: every step skips what already exists; secrets are never
# regenerated and never printed.
set -euo pipefail

DEMO=${1:-}
LIVE=/srv/bzaro
BASE=/srv/bzaro-demo
SHARED=$BASE/shared
DB=bzaro_demo
VOLUME=/var/lib/docker/volumes/deploy_caddy-data/_data/cloudflare
SITE_FILE=$LIVE/shared/caddy-sites/demo.caddy

die() { echo "✗ $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root"
[[ "$DEMO" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || die "usage: $0 <demo-domain>   e.g. bzarodemo.in"
LIVE_DOMAIN=$(grep -E '^NEXT_PUBLIC_ROOT_DOMAIN=' "$LIVE/shared/.env" | cut -d= -f2- | tr -d "\"'")
[[ "$DEMO" != "$LIVE_DOMAIN" && "$DEMO" != *".$LIVE_DOMAIN" ]] || die "the demo needs its own domain, not $LIVE_DOMAIN or a subdomain of it"
[[ -L "$LIVE/app" ]] || die "$LIVE/app is not the release layout yet"
[[ -f "$LIVE/app/deploy/ecosystem.demo.config.cjs" ]] || die "deploy the live site first (it predates the demo scripts)"
docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' bzaro-caddy | grep -q "/etc/caddy/sites" \
  || die "Caddy has no /etc/caddy/sites mount yet — deploy the live site first"
for f in pem key; do
  [[ -s /etc/ssl/cloudflare/demo-origin.$f ]] || die "missing /etc/ssl/cloudflare/demo-origin.$f (Cloudflare Origin Certificate for $DEMO)"
done
openssl x509 -in /etc/ssl/cloudflare/demo-origin.pem -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:\*\.$DEMO" \
  || die "demo-origin.pem does not cover *.$DEMO"

echo "→ folders"
mkdir -p "$BASE/releases" "$SHARED/uploads" "$LIVE/shared/caddy-sites"
chmod 755 "$BASE" "$BASE/releases" "$SHARED"

echo "→ database $DB"
if [[ "$(docker exec bzaro-postgres psql -U bzaro -d bzaro -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'")" == 1 ]]; then
  echo "   exists"
else
  docker exec bzaro-postgres createdb -U bzaro "$DB"
  echo "   created"
fi

echo "→ $SHARED/.env"
if [[ -f "$SHARED/.env" ]]; then
  echo "   exists — left as is"
else
  gen() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
  DROP='^(NEXT_PUBLIC_ROOT_DOMAIN|AUTH_URL|DATABASE_URL|DIRECT_DATABASE_URL|AUTH_SECRET|OTP_PEPPER|REVALIDATE_SECRET|CRON_SECRET|IP_HASH_SALT|INTEGRATIONS_ENCRYPTION_KEY|AUTH_GOOGLE_ID|AUTH_GOOGLE_SECRET|NEXT_PUBLIC_TURNSTILE_SITE_KEY|TURNSTILE_SECRET|WHATSAPP_[A-Z_]*|NEXT_PUBLIC_DEMO_MODE)='
  retarget() { grep -E "^$1=" "$LIVE/shared/.env" | head -1 | sed -E "s#/bzaro([?\"']|$)#/$DB\\1#"; }
  umask 077
  {
    grep -Ev "$DROP" "$LIVE/shared/.env"
    echo ""
    echo "# ── Sales demo (deploy/setup-demo.sh, $(date -u +%F)) ──"
    echo "NEXT_PUBLIC_DEMO_MODE=1"
    echo "NEXT_PUBLIC_ROOT_DOMAIN=\"$DEMO\""
    echo "AUTH_URL=\"https://$DEMO\""
    retarget DATABASE_URL
    grep -qE '^DIRECT_DATABASE_URL=' "$LIVE/shared/.env" && retarget DIRECT_DATABASE_URL
    for k in AUTH_SECRET OTP_PEPPER REVALIDATE_SECRET CRON_SECRET IP_HASH_SALT; do echo "$k=\"$(gen)\""; done
    echo "INTEGRATIONS_ENCRYPTION_KEY=\"$(openssl rand -base64 32)\""
  } > "$SHARED/.env"
  chmod 600 "$SHARED/.env"
  grep -qE "^DATABASE_URL=.*/$DB([?\"']|$)" "$SHARED/.env" || { rm -f "$SHARED/.env"; die "could not point DATABASE_URL at $DB — check the live DATABASE_URL format"; }
  echo "   written (values not shown)"
fi

echo "→ origin certificate into Caddy's volume"
install -m 600 /etc/ssl/cloudflare/demo-origin.pem "$VOLUME/demo-origin.pem"
install -m 600 /etc/ssl/cloudflare/demo-origin.key "$VOLUME/demo-origin.key"

echo "→ Caddy site $SITE_FILE"
cat > "$SITE_FILE.new" <<CADDY
# Sales demo — written by deploy/setup-demo.sh. Never indexed.
$DEMO {
	tls /data/cloudflare/demo-origin.pem /data/cloudflare/demo-origin.key {
		import cloudflare_mtls
	}
	header X-Robots-Tag "noindex, nofollow"
	import app 3001 /srv/uploads-demo
}

*.$DEMO {
	tls /data/cloudflare/demo-origin.pem /data/cloudflare/demo-origin.key {
		import cloudflare_mtls
	}
	header X-Robots-Tag "noindex, nofollow"
	@www host www.$DEMO
	redir @www https://$DEMO{uri} permanent
	import app 3001 /srv/uploads-demo
}
CADDY
[[ -f "$SITE_FILE" ]] && cp "$SITE_FILE" "$SITE_FILE.prev"
mv -f "$SITE_FILE.new" "$SITE_FILE"
if ! docker exec bzaro-caddy caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  if [[ -f "$SITE_FILE.prev" ]]; then mv -f "$SITE_FILE.prev" "$SITE_FILE"; else rm -f "$SITE_FILE"; fi
  die "Caddy rejected the demo site — nothing reloaded. Check: docker exec bzaro-caddy caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile"
fi
docker exec bzaro-caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
echo "   reloaded (the live site kept serving)"

echo "→ first demo release"
BZARO_ENV=demo bash "$LIVE/app/deploy/deploy.sh"

echo "→ showcase and category photos (copied from the live uploads, if present)"
for dir in demo categories; do
  if [[ -d "$LIVE/shared/uploads/$dir" ]]; then cp -an "$LIVE/shared/uploads/$dir" "$SHARED/uploads/"; fi
done

echo "→ seeding the demo database"
cd "$BASE/app"
npm run --silent db:seed:prod
npm run --silent db:seed:pincodes
DEMO_CREDENTIALS_FILE=/root/bzaro-demo-credentials.txt npm run --silent db:seed:showcase
chmod 600 /root/bzaro-demo-credentials.txt 2>/dev/null || true
pm2 save >/dev/null

cat <<DONE

✓ Demo is up: https://$DEMO
  Showcase seller logins: /root/bzaro-demo-credentials.txt (root only)
  Admin: same email and password as the live site
  Redeploy after a push:  BZARO_ENV=demo bash $BASE/app/deploy/deploy.sh
DONE
