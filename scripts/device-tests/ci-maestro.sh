#!/usr/bin/env sh
# ci-maestro.sh - Run Android smoke/device checks under CI emulator.
set -eu

APP_ID="com.openclaw.console"
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
FLOW_PATH=".maestro/smoke-test-android.yaml"

run_with_timeout() {
  seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return $?
  fi

  "$@"
}

echo "Waiting for emulator to be ready..."
if ! run_with_timeout 240 adb wait-for-device; then
  echo "No Android emulator device became available in time. Skipping Maestro device tests."
  exit 0
fi
sleep 10

echo "Installing OpenClaw Console..."
adb install -r "$APK_PATH"

export PATH="$HOME/.maestro/bin:$PATH"

if [ -f "$FLOW_PATH" ]; then
  echo "Running Maestro smoke tests..."
  if ! run_with_timeout 420 maestro test "$FLOW_PATH"; then
    echo "Maestro smoke test failed or timed out."
    exit 1
  fi
else
  echo "No Maestro tests found - performing basic launch test"
  adb shell am start -n "$APP_ID/.MainActivity"
  sleep 5
  if adb shell dumpsys activity activities | grep -q "$APP_ID"; then
    echo "App launched successfully"
  else
    echo "App failed to launch"
    exit 1
  fi
fi
