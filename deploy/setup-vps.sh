#!/usr/bin/env bash
# One-time bootstrap of a fresh Ubuntu 24.04 VPS for Bzaro (docs/HOSTINGER.md).
#
#   curl -fsSL https://raw.githubusercontent.com/rahulmauryaliveai-rgb/Bzaro/main/deploy/setup-vps.sh -o setup-vps.sh
#   sudo bash setup-vps.sh
#
# Idempotent: re-running skips what is already done and never overwrites an
# existing .env. Answers can be supplied as environment variables instead of
# prompts: ROOT_DOMAIN, ACME_EMAIL, ADMIN_EMAIL, ADMIN_PASSWORD, REPO_URL.
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/rahulmauryaliveai-rgb/Bzaro.git}
BASE=/srv/bzaro
APP=$BASE/app          # symlink → the live release (deploy/deploy.sh)
REPO=$BASE/repo
SHARED=$BASE/shared
NODE_MAJOR=22

[[ $EUID -eq 0 ]] || { echo "run as root (sudo bash setup-vps.sh)" >&2; exit 1; }

ask() { # ask VAR "prompt" [secret]
  local var=$1 prompt=$2 secret=${3:-}
  if [[ -z "${!var:-}" ]]; then
    if [[ -n "$secret" ]]; then read -r -s -p "$prompt: " "$var"; echo; else read -r -p "$prompt: " "$var"; fi
  fi
  [[ -n "${!var}" ]] || { echo "$var is required" >&2; exit 1; }
}

echo "== Bzaro VPS setup =="
ask ROOT_DOMAIN "Root domain (e.g. bzaro.in)"
ask ACME_EMAIL "Email for TLS certificate notices"
ask ADMIN_EMAIL "First administrator email"
ask ADMIN_PASSWORD "First administrator password (12+ chars)" secret

# ── Packages ────────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg ufw openssl >/dev/null

if ! command -v docker >/dev/null; then
  echo "→ installing Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi

if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" -lt $NODE_MAJOR ]]; then
  echo "→ installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

command -v pm2 >/dev/null || { echo "→ installing pm2"; npm install -g pm2 >/dev/null; }

# ── Firewall ────────────────────────────────────────────────────────────────
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# ── Code ────────────────────────────────────────────────────────────────────
mkdir -p "$BASE" "$BASE/releases" "$SHARED/uploads" /var/log/bzaro
if [[ -d $APP && ! -L $APP ]]; then
  echo "✗ $APP is a plain checkout (old layout) — run deploy/migrate-to-releases.sh instead" >&2
  exit 1
fi
if [[ ! -d $REPO/.git ]]; then
  echo "→ cloning $REPO_URL"
  git clone --quiet "$REPO_URL" "$REPO"
fi
cd "$REPO"
[[ -f "$SHARED/Caddyfile" ]] || cp deploy/Caddyfile "$SHARED/Caddyfile"

# ── Environment files ───────────────────────────────────────────────────────
gen() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
# The integrations key is different: it must decode to EXACTLY 32 bytes
# for AES-256-GCM, so it keeps its base64 padding rather than being
# stripped like the opaque secrets above.
genkey() { openssl rand -base64 32; }

if [[ ! -f "$SHARED/deploy.env" ]]; then
  echo "→ writing $SHARED/deploy.env"
  POSTGRES_PASSWORD=$(gen); SRH_TOKEN=$(gen)
  cat > "$SHARED/deploy.env" <<EOF
ROOT_DOMAIN=$ROOT_DOMAIN
ACME_EMAIL=$ACME_EMAIL
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
SRH_TOKEN=$SRH_TOKEN
EOF
  chmod 600 "$SHARED/deploy.env"
else
  POSTGRES_PASSWORD=$(grep ^POSTGRES_PASSWORD= "$SHARED/deploy.env" | cut -d= -f2-)
  SRH_TOKEN=$(grep ^SRH_TOKEN= "$SHARED/deploy.env" | cut -d= -f2-)
fi

if [[ ! -f "$SHARED/.env" ]]; then
  echo "→ writing $SHARED/.env"
  sed \
    -e "s|bzaro.in|$ROOT_DOMAIN|g" \
    -e "s|__POSTGRES_PASSWORD__|$POSTGRES_PASSWORD|g" \
    -e "s|__SRH_TOKEN__|$SRH_TOKEN|g" \
    -e "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$(gen)\"|" \
    -e "s|^OTP_PEPPER=.*|OTP_PEPPER=\"$(gen)\"|" \
    -e "s|^REVALIDATE_SECRET=.*|REVALIDATE_SECRET=\"$(gen)\"|" \
    -e "s|^CRON_SECRET=.*|CRON_SECRET=\"$(gen)\"|" \
    -e "s|^IP_HASH_SALT=.*|IP_HASH_SALT=\"$(gen)\"|" \
    -e "s|^INTEGRATIONS_ENCRYPTION_KEY=.*|INTEGRATIONS_ENCRYPTION_KEY=\"$(genkey)\"|" \
    -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=\"$ADMIN_EMAIL\"|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=\"$ADMIN_PASSWORD\"|" \
    deploy/env.production.example > "$SHARED/.env"
  chmod 600 "$SHARED/.env"
fi

# ── Infrastructure containers ───────────────────────────────────────────────
echo "→ starting postgres, redis and caddy"
docker compose --env-file "$SHARED/deploy.env" -f deploy/compose.yml up -d --quiet-pull
for _ in $(seq 1 30); do
  docker exec bzaro-postgres pg_isready -U bzaro -d bzaro >/dev/null 2>&1 && break
  sleep 2
done

# ── App ─────────────────────────────────────────────────────────────────────
bash "$REPO/deploy/deploy.sh"

echo "→ seeding plans, templates, categories and the administrator"
(cd "$APP" && npm run db:seed:prod)

# ── Cron + boot persistence ────────────────────────────────────────────────
install -m 644 "$APP/deploy/crontab" /etc/cron.d/bzaro
pm2 startup systemd -u root --hp /root >/dev/null
pm2 save >/dev/null

cat <<EOF

✓ Bzaro is running.

  https://$ROOT_DOMAIN                marketplace
  https://$ROOT_DOMAIN/login          sign in as $ADMIN_EMAIL → /admin
  https://<seller-slug>.$ROOT_DOMAIN   seller sites get their certificate on first visit

  pm2 status · pm2 logs bzaro-web · docker logs bzaro-caddy
  Redeploy after a push:  bash $APP/deploy/deploy.sh
  Roll back one release:  bash $APP/deploy/rollback.sh
EOF
