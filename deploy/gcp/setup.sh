#!/usr/bin/env bash
# Sets up Meetings Manager on a fresh Google Cloud e2-micro VM (Debian or Ubuntu).
# Run on the VM:   curl -fsSL https://raw.githubusercontent.com/Pranav-Singh-Devloper/task_manager/main/deploy/gcp/setup.sh | bash
# It asks for the Google client ID and secret and the owner's email, makes the other secrets itself, and starts the app.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi

echo "1/5  Adding 2 GB of swap (the build needs it on a small machine)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "2/5  Installing Docker and git"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
command -v git >/dev/null || apt-get install -y git

echo "3/5  Getting the app"
mkdir -p /opt/mm && cd /opt/mm
if [ -d app/.git ]; then git -C app pull --ff-only; else git clone https://github.com/Pranav-Singh-Devloper/task_manager.git app; fi
cd app/deploy/gcp

echo "4/5  Settings"
IP=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || true)
DOMAIN="${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
if [ ! -f .env ]; then
  read -r -p "Google client ID: " GOOGLE_CLIENT_ID < /dev/tty
  read -r -s -p "Google client secret (typing is hidden): " GOOGLE_CLIENT_SECRET < /dev/tty; echo
  read -r -p "Owner's Google email: " OWNER_EMAIL < /dev/tty
  read -r -p "Other emails allowed to sign in, comma separated (or leave empty): " OTHERS < /dev/tty
  ALLOWED="$OWNER_EMAIL${OTHERS:+,$OTHERS}"
  umask 077
  cat > .env <<ENV
GOOGLE_MODE=live
APP_URL=https://$DOMAIN
GOOGLE_REDIRECT_URI=https://$DOMAIN/api/auth/google/callback
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
OWNER_EMAIL=$OWNER_EMAIL
ALLOWED_EMAILS=$ALLOWED
SESSION_SECRET=$(openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
DEFAULT_TIMEZONE=Asia/Kolkata
MAX_UPLOAD_MB=50
LOG_LEVEL=info
TZ=UTC
ENV
fi
echo "DOMAIN=$DOMAIN" > .env.compose
chmod 600 .env .env.compose

echo "5/5  Starting (the first build takes several minutes)"
docker compose --env-file .env.compose up -d --build

echo
echo "Done. The app will be at:  https://$DOMAIN"
echo "Add this to your Google OAuth client's 'Authorised redirect URIs':"
echo "    https://$DOMAIN/api/auth/google/callback"
