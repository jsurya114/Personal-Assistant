#!/bin/bash
# ============================================
# Ultron AI — Desktop App Launcher
# Double-click to start Ultron OS & Voice Engine
# ============================================

cd "$(dirname "$0")"

echo "⚡ Starting Ultron AI Operating Assistant..."

# Start background services with PM2
./node_modules/.bin/pm2 start ecosystem.config.js

# Give server 1.5 seconds to initialize
sleep 1.5

# Launch dedicated desktop window
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app=http://localhost:3000 --window-size=1300,880
elif [ -d "/Applications/Brave Browser.app" ]; then
  open -na "Brave Browser" --args --app=http://localhost:3000 --window-size=1300,880
else
  open http://localhost:3000
fi

echo "✅ Ultron is active and running in the background."
