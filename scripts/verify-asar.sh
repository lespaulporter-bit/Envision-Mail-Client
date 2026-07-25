#!/usr/bin/env bash
# Verify packaged Les Mail asar contains critical mail modules
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASAR="${1:-$ROOT/release/mac-arm64/Les Mail.app/Contents/Resources/app.asar}"

if [[ ! -f "$ASAR" ]]; then
  echo "Missing asar: $ASAR"
  exit 1
fi

npx --yes @electron/asar list "$ASAR" > /tmp/les-mail-asar.txt

REQUIRED=(
  "node_modules/encoding-japanese/src/index.js"
  "node_modules/imapflow/package.json"
  "node_modules/mailparser/package.json"
  "node_modules/nodemailer/package.json"
  "electron/main.cjs"
  "electron/mail/imap.cjs"
  "electron/mail/smtp.cjs"
)

ok=1
for path in "${REQUIRED[@]}"; do
  if rg -F -q "$path" /tmp/les-mail-asar.txt; then
    echo "OK  $path"
  else
    echo "MISSING  $path"
    ok=0
  fi
done

if [[ "$ok" -ne 1 ]]; then
  echo "Asar verification failed"
  exit 1
fi

echo "Asar verification passed: $ASAR"
