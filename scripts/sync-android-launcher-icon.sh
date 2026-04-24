#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$ROOT/scripts/sync_app_icons.py"

echo "Android launcher assets refreshed from the canonical iOS marketing icon."
echo "Update scripts/android-launcher-icon.manifest with the new sha256 values after syncing."
