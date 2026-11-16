#!/usr/bin/env bash
# Keeps the app on the newest published image. A systemd timer runs this every couple of minutes (see systemd/).
# Pushing to main makes GitHub build and publish the image; the next run here pulls it and restarts the app.
# `up -d` only recreates the container when the image actually changed, so most runs do nothing.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

# One run at a time.
exec 9>/run/mm-update.lock
flock -n 9 || exit 0

# Pick up changes to docker-compose.yml and this script. A failure here (for example local edits) must not stop the update.
git -C ../.. pull --ff-only -q || echo "git pull skipped" >&2

docker compose --env-file .env.compose pull -q app
docker compose --env-file .env.compose up -d --no-build
docker image prune -f >/dev/null
