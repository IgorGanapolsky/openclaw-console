#!/usr/bin/env bash
set -euo pipefail

if ! command -v sips >/dev/null 2>&1; then
  echo "error: sips is required to sync Android launcher assets from the iOS icon source." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ICON="$ROOT/ios/OpenClawConsole/OpenClawConsole/Assets.xcassets/AppIcon.appiconset/icon-1024.png"

if [ ! -f "$SOURCE_ICON" ]; then
  echo "error: missing source icon: $SOURCE_ICON" >&2
  exit 1
fi

sync_density() {
  local density="$1"
  local legacy_size="$2"
  local foreground_size="$3"
  local out_dir="$ROOT/android/app/src/main/res/mipmap-$density"

  sips -s format png -z "$legacy_size" "$legacy_size" "$SOURCE_ICON" --out "$out_dir/ic_launcher.png" >/dev/null
  cp "$out_dir/ic_launcher.png" "$out_dir/ic_launcher_round.png"
  sips -s format png -z "$foreground_size" "$foreground_size" "$SOURCE_ICON" --out "$out_dir/ic_launcher_foreground.png" >/dev/null
}

sync_density mdpi 48 108
sync_density hdpi 72 162
sync_density xhdpi 96 216
sync_density xxhdpi 144 324
sync_density xxxhdpi 192 432

echo "Android launcher assets refreshed from:"
echo "  $SOURCE_ICON"
echo "Update scripts/android-launcher-icon.manifest with the new sha256 values after syncing."
