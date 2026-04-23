#!/usr/bin/env bash
# preflight-release.sh — Pre-release validation for OpenClaw Work Console
# Delegates metadata/icon validation to scripts/validate_release_contract.py
# and optionally runs platform builds for a deeper preflight.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLATFORM="both"
LAYER=1

usage() {
cat <<EOF
Usage: $(basename "$0") [options]
Options:
--platform   Target platform: android, ios, both
--layer      Validation depth: 1=metadata only, 2=metadata+build (default: 1)
-h, --help   Show this help
EOF
exit 0
}

while [[ $# -gt 0 ]]; do
case $1 in
  --platform) PLATFORM="$2"; shift 2 ;;
  --layer)    LAYER="$2"; shift 2 ;;
  -h|--help)  usage ;;
  *) echo "Unknown option: $1"; usage ;;
esac
done

if [[ ! "$PLATFORM" =~ ^(android|ios|both)$ ]]; then
  echo "Invalid platform: $PLATFORM"
  exit 2
fi

echo "OpenClaw Work Console Preflight Check"
echo "Platform: $PLATFORM"
echo "Layer:    $LAYER"

python3 "$PROJECT_ROOT/scripts/validate_release_contract.py" --platform "$PLATFORM"

if [[ "$LAYER" == "2" ]]; then
  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "both" ]]; then
    echo ""
    echo "# Android Build Check (Layer 2)"
    echo "INFO: Running lintDebug..."
    (
      cd "$PROJECT_ROOT/android"
      ./gradlew lintDebug -quiet
    )
    echo "INFO: Android lint passed"
  fi

  if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "both" ]]; then
    echo ""
    echo "# iOS Build Check (Layer 2)"
    echo "INFO: Running Xcode build (simulator/no-sign)..."
    (
      cd "$PROJECT_ROOT/ios/OpenClawConsole"
      xcodebuild build \
        -scheme OpenClawConsole \
        -destination 'generic/platform=iOS Simulator' \
        CODE_SIGN_IDENTITY="" \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGNING_ALLOWED=NO \
        -quiet
    )
    echo "INFO: iOS build passed"
  fi
fi

echo ""
echo "Preflight passed."
