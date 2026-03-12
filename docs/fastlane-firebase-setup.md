# Fastlane + Firebase Delivery Setup

This document covers setting up the CI/CD pipeline that automatically distributes builds from the `develop` branch via Firebase App Distribution (Android) and TestFlight (iOS).

## How It Works

```
Push to develop → CI runs (ios.yml / android.yml)
                     ↓ (on success)
              internal-distribution.yml
                     ↓
    ┌────────────────┴────────────────┐
    │                                  │
    ▼                                  ▼
iOS: build → TestFlight        Android: build → Firebase
     (fastlane beta)                App Distribution
```

The `internal-distribution.yml` workflow triggers automatically when CI passes on `develop`, or can be triggered manually via `workflow_dispatch`.

## Required GitHub Secrets

Set these at: `https://github.com/YOUR_USERNAME/openclaw-console/settings/secrets/actions`

### iOS Secrets

| Secret | Description | How to get it |
|--------|-------------|---------------|
| `APPSTORE_PRIVATE_KEY` | App Store Connect API key (.p8 file contents) | App Store Connect → Users → Keys → Generate |
| `APPSTORE_KEY_ID` | Key ID from the .p8 key | Shown next to the key in App Store Connect |
| `APPSTORE_ISSUER_ID` | Issuer ID (UUID at top of Keys page) | App Store Connect → Users → Keys (top of page) |
| `MATCH_GIT_URL` | Private repo URL for match certificates | Create a private repo, e.g. `https://github.com/YOU/ios-certificates.git` |
| `MATCH_PASSWORD` | Encryption password for match | Pick a strong password, save it somewhere safe |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64-encoded `username:token` for git | `echo -n "username:github_pat_TOKEN" \| base64` |
| `ADMIN_TOKEN` | GitHub PAT with repo access | GitHub → Settings → Developer settings → Personal access tokens |

### Android Secrets

| Secret | Description | How to get it |
|--------|-------------|---------------|
| `GOOGLE_SERVICES_JSON` | Contents of `google-services.json` | Firebase Console → Project Settings → General → Your app → Download |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore | `base64 -i release.keystore` |
| `KEYSTORE_PASSWORD` | Keystore password | From when you created the keystore |
| `KEY_ALIAS` | Key alias in the keystore | From when you created the keystore |
| `KEY_PASSWORD` | Key password | From when you created the keystore |
| `FIREBASE_TOKEN` | Firebase CLI token | Run `firebase login:ci` locally |
| `GOOGLE_PLAY_JSON_KEY` | Google Play service account JSON (fallback auth for Firebase) | Google Cloud Console → IAM → Service accounts |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Dedicated Firebase service account JSON (preferred auth) | Google Cloud Console → IAM → Service accounts |

### Optional

| Secret/Variable | Description |
|-----------------|-------------|
| `FIREBASE_ANDROID_APP_ID` | Override Firebase app ID (normally auto-resolved from google-services.json) |
| `FIREBASE_IOS_APP_ID` | Firebase iOS app id for `firebase_dev` lane usage |
| `FIREBASE_INTERNAL_TESTERS` (secret or variable) | Comma-separated tester emails for Firebase App Distribution invites |
| `FIREBASE_INTERNAL_GROUPS` (secret or variable) | Comma-separated Firebase tester groups for App Distribution invites |
| `FIREBASE_REQUIRED_TESTER_EMAIL` (secret or variable) | Single tester email that must be included on every Firebase internal distribution |
| `TESTFLIGHT_GROUPS` (secret or variable) | Comma-separated App Store Connect beta groups that must receive each internal TestFlight build |
| `TESTFLIGHT_REQUIRED_TESTER_EMAIL` (secret or variable) | Internal App Store Connect tester email that must already belong to one of the required TestFlight groups |

## One-Time Setup Steps

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project "OpenClaw Console" (or use an existing one)
3. Add Android app with package name `com.openclaw.console`
4. Download `google-services.json`
5. Add iOS app with bundle ID `com.openclaw.console`
6. Download `GoogleService-Info.plist`

### 2. Set Up Firebase App Distribution

1. Firebase Console → Release & Monitor → App Distribution
2. Create tester group "qa-team" and add `iganapolsky@gmail.com`
3. Create tester group "developers"

### 3. Generate Firebase Token

```bash
npm install -g firebase-tools
firebase login:ci
# Copy the printed token → save as FIREBASE_TOKEN secret
```

### 4. Create Android Keystore

```bash
keytool -genkey -v -keystore release.keystore -alias openclaw \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass YOUR_STORE_PASSWORD -keypass YOUR_KEY_PASSWORD \
  -dname "CN=OpenClaw Console, O=Igor Ganapolsky"

# Base64 encode it for the secret
base64 -i release.keystore | pbcopy  # macOS
# or: base64 release.keystore | xclip  # Linux
```

### 5. Set Up iOS Code Signing (match)

```bash
cd ios/OpenClawConsole

# Create a private repo for certificates first
# e.g., https://github.com/IgorGanapolsky/ios-certificates

# Initialize match
fastlane match init
# Select "git" storage
# Enter the certificates repo URL

# Generate certificates
fastlane match appstore
# This creates/downloads the signing cert and provisioning profile
```

### 6. Create App Store Connect API Key

1. Go to [App Store Connect → Users → Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. Click "+" to generate a new key
3. Name: "GitHub-Actions", Access: "Admin"
4. Download the `.p8` file (only downloadable once!)
5. Note the Key ID and Issuer ID

### 7. Register App IDs

Before the first build, register your app identifiers:
- **Apple**: Apple Developer Portal → Identifiers → Register `com.openclaw.console`
- **Google Play**: Create app in Google Play Console with package `com.openclaw.console`

## Local Testing

### Android: Firebase distribution

```bash
cd android
bundle install
bundle exec fastlane firebase_dev
```

### iOS: TestFlight

```bash
cd ios/OpenClawConsole
bundle install
bundle exec fastlane beta
```

The iOS internal-delivery path is only considered valid when all of the following are true:
- `TESTFLIGHT_GROUPS` resolves to at least one internal beta group.
- `TESTFLIGHT_REQUIRED_TESTER_EMAIL` resolves to an internal App Store Connect user in one of those groups.
- The workflow verification step confirms the processed build is attached to every required group.

### Run preflight checks

```bash
./scripts/preflight-release.sh --platform both --layer 1
```

## Production Release

Trigger manually from GitHub Actions → "Native App Release" workflow:
- Select platform (ios/android/both)
- For Android: choose Google Play track (alpha/beta/production)
- For iOS: choose whether to submit for App Review

## Workflow Files

| File | Purpose |
|------|---------|
| `.github/workflows/ios.yml` | CI: build + test on PR and push to main/develop |
| `.github/workflows/android.yml` | CI: build + test on PR and push to main/develop |
| `.github/workflows/internal-distribution.yml` | CD: auto-distribute on green develop CI |
| `.github/workflows/native-release.yml` | Production: manual release to App Store / Google Play |
| `ios/OpenClawConsole/fastlane/Fastfile` | iOS lanes: beta (TestFlight), setup (match), firebase_dev |
| `ios/OpenClawConsole/fastlane/Appfile` | iOS app identifier and team IDs |
| `ios/OpenClawConsole/fastlane/Matchfile` | iOS code signing config |
| `android/fastlane/Fastfile` | Android lanes: internal (Play), firebase_dev, promote_to_production |
| `android/fastlane/Appfile` | Android package name and service account path |
| `scripts/preflight-release.sh` | Pre-release metadata validation |
