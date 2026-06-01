#!/usr/bin/env bash
# Deploy gaylonphotos to DigitalOcean droplet
# Usage: ./scripts/deploy-to-DO.sh

set -euo pipefail

REMOTE="root@134.199.211.199"
APP_DIR="/opt/gaylonphotos"

echo "=== Deploying to gaylon.photos ==="

# Push local commits to origin
echo "Pushing to origin..."
git push origin main

# Pull, install, build, restart on the droplet
echo "Updating droplet..."
ssh "$REMOTE" "cd $APP_DIR \
  && git pull origin main \
  && npm install \
  && npm run build \
  && npm prune --omit=dev \
  && pm2 restart ecosystem.config.cjs --update-env"

# Wait for app to boot, then verify
echo "Waiting for app to start..."
sleep 5

STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://gaylon.photos/)
if [ "$STATUS" = "200" ]; then
  echo "Deploy successful — https://gaylon.photos/ returned $STATUS"
else
  echo "WARNING: https://gaylon.photos/ returned $STATUS — check logs with: sshDO 'pm2 logs gaylonphotos --lines 30'"
fi

GEOCODE_STATUS=$(curl -s -o /tmp/gaylonphotos-geocode-check.json -w "%{http_code}" \
  -X POST https://gaylon.photos/api/geocode \
  -H "Content-Type: application/json" \
  -H "Origin: https://gaylon.photos" \
  --data '{"query":"florida"}')
if [ "$GEOCODE_STATUS" = "200" ]; then
  echo "Geocode check successful — /api/geocode returned $GEOCODE_STATUS"
else
  echo "WARNING: /api/geocode returned $GEOCODE_STATUS — response:"
  cat /tmp/gaylonphotos-geocode-check.json
  echo
fi
