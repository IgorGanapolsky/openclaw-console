#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_FASTLANE_DIR="$PROJECT_ROOT/ios/OpenClawConsole"
APP_IDENTIFIER="${APP_IDENTIFIER:-com.openclaw.console}"

normalize_csv() {
  printf '%s' "${1:-}" \
    | tr '\n\r;' ',' \
    | tr ',' '\n' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
    | awk 'NF && !seen[$0]++'
}

merge_csv() {
  local value
  for value in "$@"; do
    normalize_csv "$value"
  done | paste -sd, -
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "❌ Missing required environment variable: $name"
    exit 1
  fi
}

require_env APPSTORE_API_KEY_JSON
require_env IOS_MARKETING_VERSION
require_env IOS_BUILD_NUMBER

GROUPS="$(merge_csv "${TESTFLIGHT_GROUPS:-}" "${TESTFLIGHT_GROUPS_SECRET:-}")"
TESTERS="$(merge_csv \
  "${TESTFLIGHT_TESTERS:-}" \
  "${TESTFLIGHT_TESTERS_SECRET:-}" \
  "${TESTFLIGHT_REQUIRED_TESTER_EMAIL:-}" \
  "${TESTFLIGHT_REQUIRED_TESTER_EMAIL_SECRET:-}")"

if [ -z "$GROUPS" ]; then
  echo "❌ TESTFLIGHT_GROUPS must be configured for deterministic internal distribution."
  exit 1
fi

echo "🔍 TestFlight audience"
echo "  groups : $(printf '%s' "$GROUPS" | tr ',' '\n' | sed '/^$/d' | wc -l | xargs)"
echo "  testers: $(printf '%s' "$TESTERS" | tr ',' '\n' | sed '/^$/d' | wc -l | xargs)"
echo "  build  : ${IOS_MARKETING_VERSION} (${IOS_BUILD_NUMBER})"

if [ -n "$TESTERS" ]; then
  IFS=',' read -r -a tester_array <<< "$TESTERS"
  for email in "${tester_array[@]}"; do
    echo "👤 Ensuring TestFlight tester is assigned to internal groups: $email"
    (
      cd "$IOS_FASTLANE_DIR"
      bundle exec fastlane pilot add "$email" \
        -a "$APP_IDENTIFIER" \
        -g "$GROUPS" \
        --api_key_path "$APPSTORE_API_KEY_JSON"
    )
  done
fi

echo "🚀 Distributing processed build to internal TestFlight groups"
(
  cd "$IOS_FASTLANE_DIR"
  bundle exec fastlane run upload_to_testflight \
    api_key_path:"$APPSTORE_API_KEY_JSON" \
    app_identifier:"$APP_IDENTIFIER" \
    distribute_only:true \
    app_version:"$IOS_MARKETING_VERSION" \
    build_number:"$IOS_BUILD_NUMBER" \
    groups:"$GROUPS"
)

echo "🔍 Verifying TestFlight build visibility"
BUILD_LIST="$(
  cd "$IOS_FASTLANE_DIR"
  bundle exec fastlane pilot builds \
    --app_identifier "$APP_IDENTIFIER" \
    --api_key_path "$APPSTORE_API_KEY_JSON"
)"

printf '%s\n' "$BUILD_LIST"
if ! printf '%s\n' "$BUILD_LIST" | rg -F "${IOS_BUILD_NUMBER}" >/dev/null; then
  echo "❌ Build ${IOS_BUILD_NUMBER} not visible in TestFlight build list"
  exit 1
fi

if [ -n "$TESTERS" ]; then
  echo "🔍 Verifying required testers exist in TestFlight"
  TESTER_LIST="$(
    cd "$IOS_FASTLANE_DIR"
    bundle exec fastlane pilot list \
      --app_identifier "$APP_IDENTIFIER" \
      --api_key_path "$APPSTORE_API_KEY_JSON"
  )"

  printf '%s\n' "$TESTER_LIST"

  IFS=',' read -r -a tester_array <<< "$TESTERS"
  for email in "${tester_array[@]}"; do
    if ! printf '%s\n' "$TESTER_LIST" | rg -F "$email" >/dev/null; then
      echo "❌ TestFlight tester missing from account: $email"
      exit 1
    fi
  done
fi

echo "✅ TestFlight internal distribution verified for ${IOS_MARKETING_VERSION} (${IOS_BUILD_NUMBER})"
