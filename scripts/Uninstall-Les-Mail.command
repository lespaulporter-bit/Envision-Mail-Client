#!/bin/bash
# Uninstall Les Mail completely from this Mac
set -euo pipefail

osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
tell application "Les Mail" to quit
APPLESCRIPT
sleep 1
pkill -f "Les Mail" 2>/dev/null || true

APP="/Applications/Les Mail.app"
SUPPORT="$HOME/Library/Application Support/les-mail"
SUPPORT2="$HOME/Library/Application Support/Les Mail"
PREFS="$HOME/Library/Preferences/app.lesmail.desktop.plist"
CACHES="$HOME/Library/Caches/les-mail"
CACHES2="$HOME/Library/Caches/Les Mail"
STATE="$HOME/Library/Saved Application State/app.lesmail.desktop.savedState"
LOGS="$HOME/Library/Logs/Les Mail"

# Also clean old HEY Clone leftovers if present
OLD_APP="/Applications/HEY Clone.app"
OLD_SUPPORT="$HOME/Library/Application Support/hey-clone"
OLD_PREFS="$HOME/Library/Preferences/local.hey.clone.desktop.plist"

confirm=$(osascript -e 'display dialog "Uninstall Les Mail and delete local accounts/cache?\n\nYour email on Gmail/Outlook/etc is NOT deleted." buttons {"Cancel","Uninstall"} default button "Uninstall" with icon caution' -e 'button returned of result' 2>/dev/null || echo "Cancel")
if [[ "$confirm" != "Uninstall" ]]; then
  exit 0
fi

rm -rf "$APP" "$SUPPORT" "$SUPPORT2" "$CACHES" "$CACHES2" "$STATE" "$LOGS" "$OLD_APP" "$OLD_SUPPORT" 2>/dev/null || true
rm -f "$PREFS" "$OLD_PREFS" 2>/dev/null || true

# Empty from Trash if Finder moved it
osascript -e 'tell application "Finder" to empty trash' >/dev/null 2>&1 || true

osascript -e 'display dialog "Les Mail has been removed." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || echo "Les Mail has been removed."
