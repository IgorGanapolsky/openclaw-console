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

echo "Clearing app storage to ensure clean state..."
adb shell pm clear "$APP_ID"

export PATH="$HOME/.maestro/bin:$PATH"

FLOW_PATHS="$(find .maestro -maxdepth 1 -type f ! -name '*ios*' -name '*.yaml' 2>/dev/null | sort | tr '\n' ' ')"
if [ -n "$FLOW_PATHS" ]; then
  echo "Running Maestro smoke tests: $FLOW_PATHS"
  maestro test $FLOW_PATHS
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
