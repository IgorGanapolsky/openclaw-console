# Fastlane + Firebase Delivery Setup

This document covers setting up the CI/CD pipeline that automatically distributes builds from the `develop` branch via Firebase App Distribution (Android) and TestFlight (iOS).

## How It Works

```
Push to develop → CI runs (ios.yml / android.yml)
                     ↓ (both succeed for the same SHA)
              internal-distribution.yml
                     ↓
    ┌────────────────┴────────────────┐
    │                                  │
    ▼                                  ▼
iOS: build → TestFlight        Android: build → Firebase
     (fastlane beta)                App Distribution
```

The `internal-distribution.yml` workflow triggers automatically only after both `iOS CI` and `Android CI` are green for the same `develop` commit, or can be triggered manually via `workflow_dispatch`.

## Required GitHub Secrets

Set these at: `https://github.com/YOUR_USERNAME/openclaw-console/settings/secrets/actions`

### iOS Secrets

| Secret | Description | How to get it |
|--------|-------------|---------------|
| `APPSTORE_PRIVATE_KEY` | App Store Connect API key (.p8 file contents) | App Store Connect → Users → Keys → Generate |
| `APPSTORE_KEY_ID` | Key ID from the .p8 key | Shown next to the key in App Store Connect |
| `APPSTORE_ISSUER_ID` | Issuer ID (UUID at top of Keys page) | App Store Connect → Users → Keys (top of page) |
| `APPLE_TEAM_ID` | Apple Developer Team ID used for signing | Apple Developer Portal → Membership details |
| `MATCH_GIT_URL` | Private repo URL for match certificates | Create a private repo, e.g. `https://github.com/YOU/ios-certificates.git` |
| `MATCH_PASSWORD` | Encryption password for match | Pick a strong password, save it somewhere safe |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64-encoded `username:token` for git | `echo -n "username:github_pat_TOKEN" \| base64` |
| `ADMIN_TOKEN` | GitHub PAT with repo access | GitHub → Settings → Developer settings → Personal access tokens |
| `TESTFLIGHT_GROUPS` | Comma-separated internal App Store Connect beta group names that must receive each build | App Store Connect → TestFlight → Internal Testing |
| `TESTFLIGHT_REQUIRED_TESTER_EMAIL` | Internal App Store Connect tester email that must already belong to one of the required beta groups | App Store Connect → Users and Access / TestFlight |

### Android Secrets

| Secret | Description | How to get it |
|--------|-------------|---------------|
| `GOOGLE_SERVICES_JSON` | Contents of `google-services.json` | Firebase Console → Project Settings → General → Your app → Download |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore | `base64 -i release.keystore` |
| `KEYSTORE_PASSWORD` | Keystore password | From when you created the keystore |
| `KEY_ALIAS` | Key alias in the keystore | From when you created the keystore |
| `KEY_PASSWORD` | Key password | From when you created the keystore |
| `FIREBASE_PROJECT_ID` | Firebase project ID used for App Distribution verification and upload | Firebase Console → Project settings → General |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Dedicated Firebase service account JSON with `roles/firebaseappdistro.admin` on the Firebase project (preferred auth) | Google Cloud Console → IAM → Service accounts |
| `FIREBASE_TOKEN` | Firebase CLI token (deprecated compatibility fallback) | Run `firebase login:ci` locally |
| `GOOGLE_PLAY_JSON_KEY` | Google Play service account JSON (last-resort fallback, only if that service account also has Firebase App Distribution upload permission) | Google Cloud Console → IAM → Service accounts |
| `FIREBASE_INTERNAL_GROUPS` | Comma-separated Firebase tester group aliases for Android internal distribution | Firebase Console → App Distribution → Testers & Groups |
| `FIREBASE_REQUIRED_TESTER_EMAIL` | Single tester email that CI ensures belongs to the configured Firebase groups before distribution, then uses as the proof target | Firebase Console → App Distribution → Testers & Groups |

### Optional

| Secret/Variable | Description |
|-----------------|-------------|
| `FIREBASE_ANDROID_APP_ID` | Override Firebase app ID (normally auto-resolved from google-services.json) |
| `FIREBASE_IOS_APP_ID` | Firebase iOS app id for `firebase_dev` lane usage |

`FIREBASE_INTERNAL_GROUPS` and `FIREBASE_REQUIRED_TESTER_EMAIL` are required for Android internal distribution and must be stored as secrets only. CI fails if those names exist anywhere in the GitHub Actions `vars` context, including repository variables, `production` environment variables, and organization variables when applicable.

`TESTFLIGHT_GROUPS` and `TESTFLIGHT_REQUIRED_TESTER_EMAIL` are required for iOS internal distribution. They may be stored as secrets or GitHub Actions variables, but when both forms exist they must match.

`scripts/setup-secrets.sh` writes repository secrets by default, removes conflicting repository/`production` variables for the Android-only Firebase audience, and verifies repository + `production` environment config directly. Its readiness check accepts TestFlight audience values from either secrets or variables to match the workflow. If this repo lives in an organization, check org-level Actions secrets and variables separately before treating workflow readiness as fully proved.

## One-Time Setup Steps

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create or reuse the Firebase project whose ID you will store in `FIREBASE_PROJECT_ID`
3. Add Android app with package name `com.openclaw.console`
4. Download `google-services.json`
5. Add iOS app with bundle ID `com.openclaw.console`
6. Download `GoogleService-Info.plist`

### 2. Set Up Firebase App Distribution

1. Firebase Console → Release & Monitor → App Distribution
2. Create at least one Firebase tester group, for example `qa-team`
3. Add the required proof tester email to that group now, or let CI add it during distribution if the group already exists

### 3. Create Firebase App Distribution Auth

```bash
# Preferred: create a dedicated Firebase service account JSON
# and grant it roles/firebaseappdistro.admin on the Firebase project.

# Optional deprecated fallback:
npm install -g firebase-tools
firebase login:ci
# Copy the printed token -> save as FIREBASE_TOKEN only as a fallback path.
```

Use `FIREBASE_SERVICE_ACCOUNT_JSON` when possible. `FIREBASE_TOKEN` is the deprecated compatibility fallback for App Distribution when the dedicated service account is absent or missing upload permission. `GOOGLE_PLAY_JSON_KEY` alone is not enough unless that service account was also granted Firebase App Distribution upload permission.

The Android workflow is secret-only and group-based. It refuses direct-email Firebase delivery, requires `FIREBASE_PROJECT_ID`, and fails if `FIREBASE_INTERNAL_GROUPS` or `FIREBASE_REQUIRED_TESTER_EMAIL` exist anywhere in the GitHub Actions `vars` context. Before distribution, CI ensures the required tester belongs to each configured Firebase group alias, and it fails if any configured group alias does not already exist.

For Android proof, a successful `firebase appdistribution:distribute ... --groups` call is the release-level assignment step. CI follow-up checks confirm the returned release URLs and, when the current auth can read App Distribution groups/testers, the configured group/tester access prerequisites. They do not claim a second independent release-to-group readback that Firebase does not expose.

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
- The workflow verification step confirms the processed build is attached to every required group by reading each beta group's builds collection.
- When App Store Connect does not surface the required group through the app-scoped beta-group listing, the verifier may still use the required tester's included beta-group memberships to resolve the same group ids before checking those groups' builds collection.
- When App Store Connect exposes no visible beta groups at all, the only supported fallback is the documented `App Store Connect Users` internal auto-access path; in that case the verifier must still prove the required tester is visible in the app's beta tester list. Direct tester-only proof is not accepted.

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
