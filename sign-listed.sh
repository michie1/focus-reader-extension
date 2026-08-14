#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.sign}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -z "${WEB_EXT_API_KEY:-}" || -z "${WEB_EXT_API_SECRET:-}" ]]; then
  echo "Missing WEB_EXT_API_KEY or WEB_EXT_API_SECRET."
  echo "Copy .env.sign.example to .env.sign and fill in your AMO credentials."
  exit 1
fi

exec web-ext sign \
  --channel=listed \
  --amo-metadata="$ROOT_DIR/amo-metadata.json" \
  --api-key="$WEB_EXT_API_KEY" \
  --api-secret="$WEB_EXT_API_SECRET" \
  --source-dir="$ROOT_DIR" \
  --artifacts-dir="$ROOT_DIR/web-ext-artifacts" \
  --ignore-files \
    "*.sh" \
    "*.spec.js" \
    ".amo-upload-uuid" \
    ".env*" \
    "amo-metadata.json" \
    "chrome-artifacts/" \
    "chrome-background.js" \
    "icons/focus-reader-1024.png" \
    "manifest.chrome.json" \
    "node_modules/" \
    "package-lock.json" \
    "package.json" \
    "README.md" \
    "store-assets/" \
    "web-ext-artifacts/"
