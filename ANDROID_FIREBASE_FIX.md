# Android Firebase Distribution Fix

## Issue Summary

Android CI build succeeded but Firebase distribution failed with:

```
Error: Failed to upload release. There's been an error processing your upload.
The APK package name 'com.openclaw.console' does not match your Firebase app's package name 'com.iganapolsky.randomtimer'.
Change the APK package name to 'com.iganapolsky.randomtimer' and retry the upload.
```

## Root Cause

The `GOOGLE_SERVICES_JSON` GitHub secret contains Firebase configuration for Random-Timer project instead of OpenClaw Console.

## Fix Required

### Option 1: Update Firebase Project (Recommended)
1. Go to Firebase Console > Random-Timer project
2. Add a new Android app with package name `com.openclaw.console`
3. Download the updated `google-services.json`
4. Update the `GOOGLE_SERVICES_JSON` secret in GitHub repo settings

### Option 2: Create New Firebase Project
1. Create new Firebase project for OpenClaw Console
2. Add Android app with package name `com.openclaw.console`
3. Download `google-services.json`
4. Update the `GOOGLE_SERVICES_JSON` and `FIREBASE_ANDROID_APP_ID` secrets

## Verification

✅ **Android build works perfectly** - verified locally with:
- `./gradlew assembleDebug` ✅
- `./gradlew assembleRelease` ✅ (6.4MB APK generated)
- `./gradlew testDebugUnitTest` ✅
- `./gradlew clean assembleRelease` ✅

The only issue is Firebase distribution configuration, not Android compilation.

## Evidence

Build run: https://github.com/IgorGanapolsky/openclaw-console/actions/runs/22974211351
Package name in app: `com.openclaw.console` (correct)
Firebase expects: `com.iganapolsky.randomtimer` (wrong project)

## Additional Issues Found

### iOS Signing Issue
iOS build failed due to authentication issue:
```
Missing password for user igor.ganapolsky@icloud.com, and running in non-interactive shell
```

This is likely an Apple ID/App Store Connect authentication configuration issue, separate from the Firebase problem.

## Status

🔧 **Ready for fixes:**
1. **Android**: Build works perfectly, just need correct Firebase project configuration
2. **iOS**: Need to check Apple ID authentication setup in CI secrets