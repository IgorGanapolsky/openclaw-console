# Android Firebase App Distribution Configuration Fix

## Issue Summary

Android Firebase App Distribution is failing due to package name mismatch:

- **Current Firebase app package name**: `com.iganapolsky.randomtimer`
- **OpenClaw Console app package name**: `com.openclaw.console`
- **Error**: "The APK package name 'com.openclaw.console' does not match your Firebase app's package name 'com.iganapolsky.randomtimer'"

## Evidence

From workflow run 22977790879, step "Distribute to internal Firebase tester(s)":
```
Error: Failed to upload release. There's been an error processing your upload.
The APK package name 'com.openclaw.console' does not match your Firebase app's package name 'com.iganapolsky.randomtimer'. Change the APK package name to 'com.iganapolsky.randomtimer' and retry the upload.
```

## Root Cause

The `GOOGLE_SERVICES_JSON` secret contains configuration for a Firebase project that was set up for a different app (`com.iganapolsky.randomtimer`), likely a test/placeholder project.

## Solution Required

### Option 1: Create New Firebase Android App (Recommended)

1. **Access Firebase Console**: https://console.firebase.google.com
2. **Select the current project** (extract project_id from current `GOOGLE_SERVICES_JSON`)
3. **Add new Android app**:
   - Package name: `com.openclaw.console`
   - App nickname: `OpenClaw Console`
   - SHA-1 certificate fingerprint: Extract from current keystore
4. **Download new `google-services.json`**
5. **Update GitHub secret**: Replace `GOOGLE_SERVICES_JSON` with new configuration
6. **Update `FIREBASE_ANDROID_APP_ID`** secret with new app ID

### Option 2: Create New Firebase Project (Alternative)

1. **Create new Firebase project**: `openclaw-console`
2. **Add Android app** with package name: `com.openclaw.console`
3. **Enable Firebase App Distribution**
4. **Update all Firebase-related GitHub secrets**

## Files That Need Configuration

### GitHub Secrets to Update:
- `GOOGLE_SERVICES_JSON`: New configuration with correct package name
- `FIREBASE_ANDROID_APP_ID`: New app ID from Firebase console
- `FIREBASE_TOKEN`: May need refresh if using new project

### Workflow Configuration:
- `.github/workflows/internal-distribution.yml` (line 221): Currently extracts app_id from google-services.json
- No code changes needed - workflow will automatically use new configuration

## Current Status

✅ **APK Build**: Successfully builds signed APK
✅ **APK Verification**: Signature verification passes
❌ **Firebase Upload**: Fails due to package name mismatch

## Next Steps

1. **Administrator action required**: Update Firebase configuration
2. **Rerun workflow**: Test with manual dispatch
3. **Verify distribution**: Confirm internal testers receive APK

## Commands to Extract Current Configuration

```bash
# Extract current project_id (requires GOOGLE_SERVICES_JSON secret access)
echo "$GOOGLE_SERVICES_JSON" | jq -r '.project_info.project_id'

# Extract current app_id
echo "$GOOGLE_SERVICES_JSON" | jq -r '.client[0].client_info.mobilesdk_app_id'

# Extract current package name
echo "$GOOGLE_SERVICES_JSON" | jq -r '.client[0].client_info.android_client_info.package_name'
```

## Validation After Fix

```bash
# Trigger internal distribution
gh workflow run internal-distribution.yml

# Monitor for success
gh run list --workflow=internal-distribution.yml --limit=1
```

---
**Created**: 2026-03-11
**Status**: Configuration fix required
**Blocker**: Firebase app package name mismatch