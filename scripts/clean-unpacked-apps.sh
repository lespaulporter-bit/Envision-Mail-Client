#!/usr/bin/env bash
# Remove unpacked .app / .exe folders after packaging so Spotlight/Launchpad
# only show /Applications/Envision Mail.app (not Desktop build copies).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE="$ROOT/release"

rm -rf \
  "$RELEASE/mac" \
  "$RELEASE/mac-arm64" \
  "$RELEASE/mac-x64" \
  "$RELEASE/mac-universal" \
  "$RELEASE/win-unpacked" \
  "$RELEASE/linux-unpacked"

# Keep Spotlight from indexing future unpack folders under release/
touch "$RELEASE/.metadata_never_index"
touch "$ROOT/.metadata_never_index"

echo "Removed unpacked app bundles from release/ (installers kept)."
find "$RELEASE" -name 'Envision Mail.app' -print 2>/dev/null || true
