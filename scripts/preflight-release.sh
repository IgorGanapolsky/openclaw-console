#!/usr/bin/env bash
# preflight-release.sh — Pre-release validation for OpenClaw Work Console
# Ensures store listing metadata, privacy policy, changelogs, and build
# integrity are all present and correct before publishing.
#
# Usage:
#   ./scripts/preflight-release.sh --platform android|ios|both [--layer 1|2]
#
# Layers:
#   1 (default) — Metadata & file checks only (fast, no build)
#   2           — Full validation including Gradle/Xcode builds
set -euo pipefail
# ── Globals ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLATFORM="both"
LAYER=1
ERRORS=()
WARNINGS=()
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'
# ── Helpers ──────────────────────────────────────────────────────────────────
usage() {
cat <<EOF
Usage: $(basename "$0") [options]
Options:
--platform   Target platform (required): android, ios, both
--layer      Validation depth: 1=metadata only, 2=metadata+build (default: 1)
-h, --help   Show this help
EOF
exit 0
}
err() { ERRORS+=("$1"); echo -e "${RED}${BOLD}ERROR:${RESET} $1"; }
warn() { WARNINGS+=("$1"); echo -e "${YELLOW}${BOLD}WARN:${RESET} $1"; }
info() { echo -e "${CYAN}INFO:${RESET} $1"; }
header() { echo -e "\n${BOLD}# $1${RESET}"; }
check_file_exists() {
local path="$1"
if [[ ! -f "$path" ]]; then
  err "Missing required file: $path"
  return 1
fi
return 0
}
check_file_nonempty() {
local path="$1"
if [[ ! -f "$path" ]]; then
  err "Missing required file: $path"
  return 1
fi
if [[ ! -s "$path" ]]; then
  err "Required file is empty: $path"
  return 1
fi
return 0
}
check_dir_has_files() {
local dir="$1"
local min="$2"
local count
count=$(find "$dir" -maxdepth 1 -type f | wc -l)
if (( count < min )); then
  err "Directory $dir contains $count files (minimum $min required)"
  return 1
fi
return 0
}
# ── Parse args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
case $1 in
  --platform) PLATFORM="$2"; shift 2 ;;
  --layer)    LAYER="$2"; shift 2 ;;
  -h|--help)  usage ;;
  *) echo "Unknown option: $1"; usage ;;
esac
done
if [[ -z "$PLATFORM" ]]; then
echo "Platform is required"
exit 2
fi
if [[ ! "$PLATFORM" =~ ^(android|ios|both)$ ]]; then
echo "Invalid platform"
exit 2
fi
echo -e "${BOLD}OpenClaw Work Console Preflight Check${RESET}"
echo "Platform: $PLATFORM"
echo "Layer:    $LAYER"
# ── Extract versions ─────────────────────────────────────────────────────────
header "Version Extraction"
ANDROID_VERSION_NAME="unknown"
ANDROID_VERSION_CODE="unknown"
IOS_VERSION_NAME="unknown"
IOS_BUILD_NUMBER="unknown"
GRADLE_FILE="$PROJECT_ROOT/android/app/build.gradle.kts"
if [[ -f "$GRADLE_FILE" ]]; then
ANDROID_VERSION_NAME=$(sed -n 's/.*versionName *= *"\([^"]*\)".*/\1/p' "$GRADLE_FILE")
ANDROID_VERSION_CODE=$(sed -n 's/.*versionCode *= *\([0-9]*\).*/\1/p' "$GRADLE_FILE")
info "Android: $ANDROID_VERSION_NAME ($ANDROID_VERSION_CODE)"
fi
PBXPROJ="$PROJECT_ROOT/ios/OpenClawConsole/OpenClawConsole.xcodeproj/project.pbxproj"
if [[ -f "$PBXPROJ" ]]; then
IOS_VERSION_NAME=$(grep -m1 'MARKETING_VERSION' "$PBXPROJ" | cut -d'=' -f2 | tr -d ' ;')
IOS_BUILD_NUMBER=$(grep -m1 'CURRENT_PROJECT_VERSION' "$PBXPROJ" | cut -d'=' -f2 | tr -d ' ;')
info "iOS:     $IOS_VERSION_NAME ($IOS_BUILD_NUMBER)"
else
IOS_INFO_PLIST="$PROJECT_ROOT/ios/OpenClawConsole/OpenClawConsole/Info.plist"
if [[ -f "$IOS_INFO_PLIST" ]]; then
  IOS_VERSION_NAME=$(plutil -extract CFBundleShortVersionString raw "$IOS_INFO_PLIST" 2>/dev/null || true)
  IOS_BUILD_NUMBER=$(plutil -extract CFBundleVersion raw "$IOS_INFO_PLIST" 2>/dev/null || true)
  info "iOS (Info.plist): $IOS_VERSION_NAME ($IOS_BUILD_NUMBER)"
fi
fi
# Cross-platform version parity warning
if [[ -n "$ANDROID_VERSION_NAME" && -n "$IOS_VERSION_NAME" ]]; then
if [[ "$ANDROID_VERSION_NAME" != "$IOS_VERSION_NAME" ]]; then
  warn "Version name mismatch! Android: $ANDROID_VERSION_NAME vs iOS: $IOS_VERSION_NAME"
fi
fi
# ══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — Metadata & File Checks
# ══════════════════════════════════════════════════════════════════════════════
# ── Privacy Policy ───────────────────────────────────────────────────────────
header "Privacy Policy Check"
PRIVACY_FILE="$PROJECT_ROOT/PRIVACY_POLICY.md"
if check_file_nonempty "$PRIVACY_FILE"; then
info "Privacy policy found and non-empty"
else
  err "Privacy policy missing or empty"
fi
# ── Android Metadata ─────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "both" ]]; then
header "Android Store Metadata Check"
ANDROID_META="$PROJECT_ROOT/android/fastlane/metadata/android/en-US"
# Required text files
for f in title.txt short_description.txt full_description.txt; do
  check_file_nonempty "$ANDROID_META/$f"
done
# Changelog for current version code
if [[ -n "$ANDROID_VERSION_CODE" ]]; then
  CHANGELOG="$ANDROID_META/changelogs/$ANDROID_VERSION_CODE.txt"
  if check_file_nonempty "$CHANGELOG"; then
    info "Android changelog found for version $ANDROID_VERSION_CODE"
  fi
else
  warn "Android version code unknown, skipping changelog check"
fi
# Screenshots
SCREENSHOTS_DIR="$PROJECT_ROOT/android/fastlane/metadata/android/en-US/images/phoneScreenshots"
if [[ -d "$SCREENSHOTS_DIR" ]]; then
  check_dir_has_files "$SCREENSHOTS_DIR" 2
  SHOT_COUNT=$(find "$SCREENSHOTS_DIR" -maxdepth 1 -type f | wc -l)
  info "Found $SHOT_COUNT Android phone screenshots"
else
  warn "Android phone screenshots directory exists but is empty (add screenshots before production release)"
fi
# Description length checks
if [[ -f "$ANDROID_META/short_description.txt" ]]; then
  SHORT_LEN=$(wc -c < "$ANDROID_META/short_description.txt")
  if (( SHORT_LEN > 80 )); then
    err "Android short description exceeds 80 chars ($SHORT_LEN)"
  fi
fi
if [[ -f "$ANDROID_META/title.txt" ]]; then
  TITLE_LEN=$(wc -c < "$ANDROID_META/title.txt")
  if (( TITLE_LEN > 30 )); then
    err "Android title exceeds 30 chars ($TITLE_LEN)"
  fi
fi
fi
# ── iOS Metadata ─────────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "both" ]]; then
header "iOS App Store Metadata Check"
IOS_META="$PROJECT_ROOT/ios/OpenClawConsole/fastlane/metadata"
# Required text files
for f in name.txt subtitle.txt description.txt keywords.txt release_notes.txt; do
  check_file_nonempty "$IOS_META/en-US/$f"
done
# Privacy URL (required by App Store)
if check_file_nonempty "$IOS_META/en-US/privacy_url.txt"; then
  PRIVACY_URL=$(cat "$IOS_META/en-US/privacy_url.txt")
  if [[ ! "$PRIVACY_URL" =~ ^https:// ]]; then
    err "iOS privacy_url.txt must start with https://"
  fi
fi
# Support URL
check_file_nonempty "$IOS_META/en-US/support_url.txt"
# Field length checks
if [[ -f "$IOS_META/en-US/name.txt" ]]; then
  NAME_LEN=$(wc -c < "$IOS_META/en-US/name.txt")
  if (( NAME_LEN > 30 )); then
    err "iOS app name exceeds 30 chars ($NAME_LEN)"
  fi
fi
if [[ -f "$IOS_META/en-US/subtitle.txt" ]]; then
  SUB_LEN=$(wc -c < "$IOS_META/en-US/subtitle.txt")
  if (( SUB_LEN > 30 )); then
    err "iOS subtitle exceeds 30 chars ($SUB_LEN)"
  fi
fi
if [[ -f "$IOS_META/en-US/keywords.txt" ]]; then
  KW_LEN=$(wc -c < "$IOS_META/en-US/keywords.txt")
  if (( KW_LEN > 100 )); then
    err "iOS keywords exceed 100 chars ($KW_LEN)"
  fi
fi
fi
# ══════════════════════════════════════════════════════════════════════════════
# LAYER 2 — Build Validation (optional)
# ══════════════════════════════════════════════════════════════════════════════
if [[ "$LAYER" == "2" ]]; then
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "both" ]]; then
  header "Android Build Check (Layer 2)"
  info "Running lintDebug..."
  if (cd "$PROJECT_ROOT/android" && ./gradlew lintDebug -quiet); then
    info "Android lint passed"
  else
    err "Android lint failed"
  fi
fi
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "both" ]]; then
  header "iOS Build Check (Layer 2)"
  info "Running Xcode build (simulator/no-sign)..."
  SCHEME="OpenClawConsole"
  if (cd "$PROJECT_ROOT/ios/OpenClawConsole" && xcodebuild build \
    -scheme "$SCHEME" \
    -destination 'generic/platform=iOS Simulator' \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    -quiet 2>&1); then
    info "iOS build passed"
  else
    err "iOS build failed"
  fi
fi
fi
# ══════════════════════════════════════════════════════════════════════════════
# RESULTS
# ══════════════════════════════════════════════════════════════════════════════
header "Validation Summary"
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
echo -e "${YELLOW}${BOLD}Warnings:${RESET}"
for w in "${WARNINGS[@]}"; do
  echo -e "  - $w"
done
fi
if [[ ${#ERRORS[@]} -gt 0 ]]; then
echo -e "${RED}${BOLD}Errors:${RESET}"
for e in "${ERRORS[@]}"; do
  echo -e "  - $e"
done
echo
echo -e "${RED}${BOLD}Preflight failed.${RESET} Please resolve errors before merging to main."
exit 1
fi
echo
echo -e "${GREEN}${BOLD}Preflight check passed!${RESET} Ready for release."
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
echo -e "${YELLOW}Review warnings above before proceeding.${RESET}"
fi
exit 0
