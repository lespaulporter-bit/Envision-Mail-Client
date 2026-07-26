#!/usr/bin/env bash
# Build Mac + Windows installers and print the files to attach to a GitHub Release.
# Usage: bash scripts/pack-release.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building icons + web + Mac + Windows"
npm run build:icons
npm run build:web
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg zip --arm64 --win nsis --x64
bash scripts/verify-asar.sh
bash scripts/clean-unpacked-apps.sh

VER="$(node -p "require('./package.json').version")"
echo ""
echo "==> Release artifacts for v${VER}:"
ls -lh release/EnvisionMail-"${VER}"-mac-* release/EnvisionMail-"${VER}"-win-* release/latest-mac.yml release/latest.yml 2>/dev/null || true
echo ""
echo "Upload with:"
echo "  gh release upload v${VER} release/EnvisionMail-${VER}-mac-arm64.dmg release/EnvisionMail-${VER}-mac-arm64.zip release/EnvisionMail-${VER}-mac-arm64.*.blockmap release/latest-mac.yml release/EnvisionMail-${VER}-win-x64-Setup.exe release/EnvisionMail-${VER}-win-x64-Setup.exe.blockmap release/latest.yml --clobber"
