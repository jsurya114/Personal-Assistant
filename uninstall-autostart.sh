#!/bin/bash
# ==========================================================
# Ultron AI — Stop and Remove Permanent Background Service
# ==========================================================

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
PLIST_FILE="$HOME/Library/LaunchAgents/com.ultron.daemon.plist"

echo "🛑 Stopping Ultron Background Services..."

# 1. Unload launchd
launchctl unload "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"

# 2. Stop PM2 apps
./node_modules/.bin/pm2 stop all 2>/dev/null || true
./node_modules/.bin/pm2 delete all 2>/dev/null || true
./node_modules/.bin/pm2 save --force 2>/dev/null || true

echo "✅ Ultron background service stopped and removed from auto-start."
