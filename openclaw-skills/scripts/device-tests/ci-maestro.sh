#!/usr/bin/env sh
# ci-maestro.sh - Run Android smoke/device checks under CI emulator.
set -eu

APP_ID="com.openclaw.console"
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
FLOW_PATH=".maestro/smoke-test-android.yaml"

echo "Waiting for emulator to be ready..."
adb wait-for-device
sleep 10

echo "Installing OpenClaw Console..."
adb install -r "$APK_PATH"

export PATH="$HOME/.maestro/bin:$PATH"

if [ -f "$FLOW_PATH" ]; then
  echo "Running Maestro smoke tests..."
  maestro test "$FLOW_PATH"
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
