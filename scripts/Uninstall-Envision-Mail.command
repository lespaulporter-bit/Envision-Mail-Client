#!/bin/bash
# Uninstall Envision Mail (and optional Les Mail leftovers)
set -euo pipefail

osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
tell application "Envision Mail" to quit
tell application "Les Mail" to quit
APPLESCRIPT
sleep 1
pkill -f "Envision Mail" 2>/dev/null || true
pkill -f "Les Mail" 2>/dev/null || true

confirm=$(osascript -e 'display dialog "Remove Envision Mail from this Mac?

• Deletes the app and local mail cache/accounts on this device
• Does NOT delete mail on Gmail/Outlook/etc
• Also removes old Les Mail app data if present" buttons {"Cancel","Uninstall"} default button "Uninstall" with icon caution' -e 'button returned of result' 2>/dev/null || echo "Cancel")
if [[ "$confirm" != "Uninstall" ]]; then
  exit 0
fi

rm -rf   "/Applications/Envision Mail.app"   "/Applications/Les Mail.app"   "$HOME/Library/Application Support/Envision Mail"   "$HOME/Library/Application Support/envision-mail"   "$HOME/Library/Application Support/Les Mail"   "$HOME/Library/Caches/Envision Mail"   "$HOME/Library/Caches/envision-mail"   "$HOME/Library/Caches/Les Mail"   "$HOME/Library/Logs/Envision Mail"   "$HOME/Library/Logs/Les Mail"   "$HOME/Library/Saved Application State/app.envisionmail.desktop.savedState"   "$HOME/Library/Saved Application State/app.lesmail.desktop.savedState"   2>/dev/null || true

rm -f   "$HOME/Library/Preferences/app.envisionmail.desktop.plist"   "$HOME/Library/Preferences/app.lesmail.desktop.plist"   2>/dev/null || true

osascript -e 'display dialog "Envision Mail has been removed." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || echo "Envision Mail has been removed."
