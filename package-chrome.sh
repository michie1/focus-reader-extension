#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$ROOT_DIR/manifest.chrome.json" | head -n 1)"
OUTPUT_DIR="$ROOT_DIR/chrome-artifacts"
PACKAGE_DIR="$OUTPUT_DIR/focus-reader-$VERSION"
ZIP_FILE="$OUTPUT_DIR/focus-reader-$VERSION-chrome.zip"

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/icons" "$PACKAGE_DIR/vendor"

cp "$ROOT_DIR/manifest.chrome.json" "$PACKAGE_DIR/manifest.json"
cp "$ROOT_DIR/chrome-background.js" "$ROOT_DIR/background.js" "$ROOT_DIR/extension-api.js" "$PACKAGE_DIR/"
cp "$ROOT_DIR/reader.html" "$ROOT_DIR/reader.css" "$ROOT_DIR/reader.js" "$ROOT_DIR/reader-extract.js" "$ROOT_DIR/reader-overlay.js" "$PACKAGE_DIR/"
cp "$ROOT_DIR/icons/"*.png "$PACKAGE_DIR/icons/"
cp "$ROOT_DIR/vendor/Readability.js" "$ROOT_DIR/vendor/READABILITY-LICENSE.md" "$PACKAGE_DIR/vendor/"

rm -f "$ZIP_FILE"
(cd "$PACKAGE_DIR" && zip -qr "$ZIP_FILE" .)

printf '%s\n' "Unpacked extension: $PACKAGE_DIR" "Chrome Web Store ZIP: $ZIP_FILE"
