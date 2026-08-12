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
  --channel=unlisted \
  --api-key="$WEB_EXT_API_KEY" \
  --api-secret="$WEB_EXT_API_SECRET" \
  --source-dir="$ROOT_DIR" \
  --artifacts-dir="$ROOT_DIR/web-ext-artifacts"
