#!/bin/bash
# Uninstall Envision Mail completely from this Mac
set -euo pipefail

osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
tell application "Envision Mail" to quit
APPLESCRIPT
sleep 1
pkill -f "Envision Mail" 2>/dev/null || true

APP="/Applications/Envision Mail.app"
SUPPORT="$HOME/Library/Application Support/envision-mail"
SUPPORT2="$HOME/Library/Application Support/Envision Mail"
PREFS="$HOME/Library/Preferences/app.envisionmail.desktop.plist"
CACHES="$HOME/Library/Caches/envision-mail"
CACHES2="$HOME/Library/Caches/Envision Mail"
STATE="$HOME/Library/Saved Application State/app.envisionmail.desktop.savedState"
LOGS="$HOME/Library/Logs/Envision Mail"

# Also clean old HEY Clone leftovers if present
OLD_APP="/Applications/HEY Clone.app"
OLD_SUPPORT="$HOME/Library/Application Support/hey-clone"
OLD_PREFS="$HOME/Library/Preferences/local.hey.clone.desktop.plist"

confirm=$(osascript -e 'display dialog "Uninstall Envision Mail and delete local accounts/cache?\n\nYour email on Gmail/Outlook/etc is NOT deleted." buttons {"Cancel","Uninstall"} default button "Uninstall" with icon caution' -e 'button returned of result' 2>/dev/null || echo "Cancel")
if [[ "$confirm" != "Uninstall" ]]; then
  exit 0
fi

rm -rf "$APP" "$SUPPORT" "$SUPPORT2" "$CACHES" "$CACHES2" "$STATE" "$LOGS" "$OLD_APP" "$OLD_SUPPORT" 2>/dev/null || true
rm -f "$PREFS" "$OLD_PREFS" 2>/dev/null || true

# Empty from Trash if Finder moved it
osascript -e 'tell application "Finder" to empty trash' >/dev/null 2>&1 || true

osascript -e 'display dialog "Envision Mail has been removed." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || echo "Envision Mail has been removed."
