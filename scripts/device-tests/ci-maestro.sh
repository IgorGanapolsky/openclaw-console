#!/usr/bin/env sh
# ci-maestro.sh - Run Android smoke/device checks under CI emulator.
set -eu

APP_ID="com.openclaw.console"
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

echo "Waiting for emulator to be ready..."
adb wait-for-device
sleep 10

echo "Installing OpenClaw Console..."
adb install -r "$APK_PATH"

export PATH="$HOME/.maestro/bin:$PATH"

# Find all non-iOS E2E test files under .maestro
FLOWS="$(find .maestro -maxdepth 1 -type f ! -name '*ios*' -name '*.yaml' 2>/dev/null | sort)"

if [ -n "$FLOWS" ]; then
  echo "Running Maestro smoke tests sequentially..."
  FAILED=0
  for FLOW in $FLOWS; do
    echo "========================================="
    echo "Running Maestro test: $FLOW"
    echo "Clearing app storage to ensure clean state..."
    adb shell pm clear "$APP_ID"
    
    if ! maestro test "$FLOW"; then
      echo "ERROR: Maestro test failed: $FLOW"
      FAILED=$((FAILED + 1))
    fi
  done
  
  if [ "$FAILED" -ne 0 ]; then
    echo "Maestro smoke tests completed: $FAILED flow(s) failed."
    exit 1
  else
    echo "All Maestro smoke tests passed successfully!"
  fi
else
  echo "No Maestro tests found - performing basic launch test"
  adb shell pm clear "$APP_ID"
  adb shell am start -n "$APP_ID/.MainActivity"
  sleep 5
  if adb shell dumpsys activity activities | grep -q "$APP_ID"; then
    echo "App launched successfully"
  else
    echo "App failed to launch"
    exit 1
  fi
fi
