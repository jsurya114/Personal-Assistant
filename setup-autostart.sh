#!/bin/bash
# ==========================================================
# Ultron AI — 24/7 Background Software & Auto-Start Setup
# Makes Ultron run permanently in background across reboots
# ==========================================================

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
NODE_PATH="$(which node)"
PM2_PATH="$PROJECT_DIR/node_modules/.bin/pm2"

echo "⚡ Configuring Ultron 24/7 Background Engine..."

# 1. Ensure logs directory exists
mkdir -p logs

# 2. Start PM2 ecosystem (server + voice engine)
$PM2_PATH start ecosystem.config.js

# 3. Save PM2 state
$PM2_PATH save

# 4. Create macOS LaunchAgent for user login auto-start
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.ultron.daemon.plist"
mkdir -p "$PLIST_DIR"

cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ultron.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd "$PROJECT_DIR" && ./node_modules/.bin/pm2 resurrect</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$PROJECT_DIR/logs/autostart.log</string>
  <key>StandardErrorPath</key>
  <string>$PROJECT_DIR/logs/autostart-error.log</string>
</dict>
</plist>
EOF

# 5. Load LaunchAgent
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE" 2>/dev/null || true

echo "✅ Ultron is now running as a permanent background software!"
echo "👉 Both the Web Server & Voice Engine are active."
echo "👉 Ultron will auto-start whenever you turn on your Mac."
echo "👉 Open anytime: http://localhost:3000 or click Launch-Ultron.command"
