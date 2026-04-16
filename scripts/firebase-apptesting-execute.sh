#!/usr/bin/env bash
# Run Firebase App Testing agent against an APK or the latest App Distribution release.
# Requires: firebase-tools (npm), GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON,
#           FIREBASE_ANDROID_APP_ID (1:project:android:hex form).
# Docs: https://firebase.google.com/docs/app-distribution/android/app-testing-agent
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR_DEFAULT="$REPO_ROOT/android/apptesting"
APK_PATH=""
TEST_DIR="$TEST_DIR_DEFAULT"
TEST_DEVICES="${FIREBASE_APP_TESTING_DEVICES:-model=panther,version=33,locale=en,orientation=portrait}"
NON_BLOCKING=0
DEBUG_CLI=0

usage() {
  cat <<'USAGE'
Usage: firebase-apptesting-execute.sh [--apk PATH] [--test-dir DIR] [--test-devices SPEC] [--non-blocking] [--debug]

  --apk             Path to release/debug APK (omit to use latest App Distribution release for --app)
  --test-dir        Directory where agent YAML suites live (default: android/apptesting)
  --test-devices    Semicolon-separated Test Lab device specs (default: env FIREBASE_APP_TESTING_DEVICES or preset)
  --non-blocking    Pass --test-non-blocking to firebase CLI (exit before agent finishes)
  --debug           Pass --debug to firebase CLI (verbose; may log sensitive URLs — use only when diagnosing failures)

Environment:
  FIREBASE_ANDROID_APP_ID          Required Firebase Android app id
  FIREBASE_SERVICE_ACCOUNT_JSON    Service account JSON body (written to temp file for ADC)
  GOOGLE_APPLICATION_CREDENTIALS   Optional; if set, FIREBASE_SERVICE_ACCOUNT_JSON is ignored
  FIREBASE_APPTESTING_DEBUG        If set to "true", same as --debug (for CI wiring without argv changes)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk)
      APK_PATH="${2:?}"
      shift 2
      ;;
    --test-dir)
      TEST_DIR="${2:?}"
      shift 2
      ;;
    --test-devices)
      TEST_DEVICES="${2:?}"
      shift 2
      ;;
    --non-blocking)
      NON_BLOCKING=1
      shift
      ;;
    --debug)
      DEBUG_CLI=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${FIREBASE_APPTESTING_DEBUG:-}" == "true" ]]; then
  DEBUG_CLI=1
fi

if [[ -z "${FIREBASE_ANDROID_APP_ID:-}" ]]; then
  echo "❌ FIREBASE_ANDROID_APP_ID is not set" >&2
  exit 1
fi

if [[ ! -d "$TEST_DIR" ]]; then
  echo "❌ Test directory not found: $TEST_DIR" >&2
  exit 1
fi

CREDS_FILE=""
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  if [[ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
    echo "❌ GOOGLE_APPLICATION_CREDENTIALS is not a file: $GOOGLE_APPLICATION_CREDENTIALS" >&2
    exit 1
  fi
else
  if [[ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
    echo "❌ Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON" >&2
    exit 1
  fi
  CREDS_FILE="$(mktemp)"
  trap 'rm -f "$CREDS_FILE"' EXIT
  printf '%s\n' "$FIREBASE_SERVICE_ACCOUNT_JSON" >"$CREDS_FILE"
  export GOOGLE_APPLICATION_CREDENTIALS="$CREDS_FILE"
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "❌ firebase CLI not found. Install: npm install -g firebase-tools" >&2
  exit 1
fi

# Bind CLI + ADC to the same GCP project as the service account (fixes "Requesting test execution"
# failures when the default Firebase project is unset or mismatched vs App Distribution).
FIREBASE_CLI_PROJECT=""
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  FIREBASE_CLI_PROJECT="$(
    python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8"))["project_id"])' \
      "$GOOGLE_APPLICATION_CREDENTIALS"
  )"
fi
if [[ -z "$FIREBASE_CLI_PROJECT" ]]; then
  echo "❌ Could not read project_id from service account JSON" >&2
  exit 1
fi
export GOOGLE_CLOUD_PROJECT="$FIREBASE_CLI_PROJECT"
export GCLOUD_PROJECT="$FIREBASE_CLI_PROJECT"

ARGS=(
  apptesting:execute
  "--app=$FIREBASE_ANDROID_APP_ID"
  "--test-dir=$TEST_DIR"
  "--test-devices=$TEST_DEVICES"
)

if [[ "$NON_BLOCKING" -eq 1 ]]; then
  ARGS+=(--test-non-blocking)
fi

if [[ -n "$APK_PATH" ]]; then
  if [[ ! -f "$APK_PATH" ]]; then
    echo "❌ APK not found: $APK_PATH" >&2
    exit 1
  fi
  ARGS+=("$APK_PATH")
fi

FB=(firebase --non-interactive -P "$FIREBASE_CLI_PROJECT")
if [[ "$DEBUG_CLI" -eq 1 ]]; then
  FB+=(--debug)
fi
FB+=("${ARGS[@]}")

echo "Running: ${FB[*]}"
"${FB[@]}"