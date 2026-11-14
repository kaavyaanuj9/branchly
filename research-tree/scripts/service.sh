#!/bin/bash
# Run the research tree as a macOS background service (launchd LaunchAgent).
#
#   scripts/service.sh install    # start now, at every login, and restart if it crashes
#   scripts/service.sh uninstall  # stop and remove the service
#   scripts/service.sh status     # is it running? last poll?
#   scripts/service.sh logs       # follow the server log
#
# While running it keeps the Mac from idle-sleeping (caffeinate -i) so releases aren't missed.
# A closed lid on battery still sleeps the Mac.
set -euo pipefail

LABEL="com.researchtree.server"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$ROOT/data/server.log"
DOMAIN="gui/$(id -u)"

case "${1:-status}" in
  install)
    mkdir -p "$ROOT/data" "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>$ROOT/.venv/bin/python</string><string>-u</string><string>$ROOT/server.py</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "installed; log: $LOG"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "removed"
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      launchctl print "$DOMAIN/$LABEL" | grep -E "^\s+(state|pid|runs|last exit code)" || true
      curl -s -m 5 http://127.0.0.1:8765/api/status | python3 -c 'import sys,json,time; d=json.load(sys.stdin); print("papers", d["papers"], "| last poll", round((time.time()-d["last_poll"])/60,1) if d["last_poll"] else None, "min ago | next release in", round((d["next_announcement"]-time.time())/3600,2), "h")' 2>/dev/null || echo "server not answering yet"
    else
      echo "not installed"
    fi
    ;;
  logs)
    tail -f "$LOG"
    ;;
  *)
    echo "usage: $0 install|uninstall|status|logs"; exit 1
    ;;
esac
