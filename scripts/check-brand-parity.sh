#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/scripts/android-launcher-icon.manifest"

if [ ! -f "$MANIFEST" ]; then
  echo "error: missing brand parity manifest: $MANIFEST" >&2
  exit 1
fi

FAILURES=0

while read -r expected path; do
  if [ -z "${expected:-}" ] || [[ "$expected" == \#* ]]; then
    continue
  fi

  file="$ROOT/$path"
  if [ ! -f "$file" ]; then
    echo "error: missing tracked brand asset: $path" >&2
    FAILURES=1
    continue
  fi

  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "error: brand parity drift for $path" >&2
    echo "       expected $expected" >&2
    echo "       actual   $actual" >&2
    FAILURES=1
  fi
done <"$MANIFEST"

if [ "$FAILURES" -ne 0 ]; then
  echo "Run scripts/sync-android-launcher-icon.sh and refresh scripts/android-launcher-icon.manifest." >&2
  exit 1
fi

echo "Brand parity OK"
