#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PNG="$ROOT/build/icon.png"
ICONSET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"

if [[ ! -f "$PNG" ]]; then
  echo "Missing $PNG — run node scripts/generate-icons.mjs first"
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

mk() {
  local pixels="$1"
  local name="$2"
  sips -z "$pixels" "$pixels" "$PNG" --out "$ICONSET/$name" >/dev/null
}

mk 16 icon_16x16.png
mk 32 diana@2x_16.png
mk 32 icon_32x32.png
mk 64 diana@2x_32.png
mk 128 icon_128x128.png
mk 256 diana@2x_128.png
mk 256 icon_256x256.png
mk 512 diana@2x_256.png
mk 512 icon_512x512.png
mk 1024 diana@2x_512.png

mv "$ICONSET/diana@2x_16.png" "$ICONSET/icon_16x16@2x.png"
mv "$ICONSET/diana@2x_32.png" "$ICONSET/icon_32x32@2x.png"
mv "$ICONSET/diana@2x_128.png" "$ICONSET/icon_128x128@2x.png"
mv "$ICONSET/diana@2x_256.png" "$ICONSET/icon_256x256@2x.png"
mv "$ICONSET/diana@2x_512.png" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$ICNS"
echo "Wrote $ICNS"
