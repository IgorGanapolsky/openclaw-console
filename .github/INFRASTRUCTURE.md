# OpenClaw Console Infrastructure

This document outlines the infrastructure and CI/CD setup for OpenClaw Console.

## Branch Strategy

We follow a modified GitFlow approach:

- `develop` is the main development branch
- Feature branches are created from `develop`
- `main` is protected and only receives changes through releases
- All work must go through PRs to `develop`
- Releases are created from `develop` to `main`

## CI/CD Pipelines

### Core Workflows

1. **CI Pipeline** (`ci.yml`)
   - Runs on PRs and pushes to develop
   - Architecture lint (Kotlin + Swift)
   - Skills tests
   - Android build check
   - iOS build check

2. **Security Pipeline** (`security.yml`)
   - CodeQL analysis
   - Gitleaks secret scanning
   - npm audit
   - Custom secret pattern detection

3. **Claude Review** (`claude-review.yml`)
   - AI-powered PR review with OpenClaw-specific prompts
   - Checks for gateway protocol compliance, biometric safety, etc.

4. **Enforce Develop to Main** (`enforce-develop-to-main.yml`)
   - Only develop/release/hotfix branches can merge to main

5. **PR State Machine** (`pr-state-machine.yml`)
   - Automated label management for PR lifecycle
   - Creates incident issues for failing checks
   - Commit status reporting

6. **North Star Guardrail** (`north-star-guardrail.yml`)
   - Daily check against product North Star metrics
   - Enforces alignment with "Quiet mobile cockpit for OpenClaw agents"

7. **Release Pipeline** (`release.yml`)
   - Handles versioned releases
   - Creates production builds
   - Manages app store submissions

### Branch Protection

#### develop

- Required status checks:
  - Skills Tests
  - Architecture Lint Kotlin
  - Architecture Lint Swift
- Dismiss stale reviews
- No direct pushes

#### main

- All develop protections plus:
- Required status checks:
  - Skills Tests
  - Architecture Lint Kotlin
  - Architecture Lint Swift
  - Android Build Check
  - iOS Build Check
  - Secrets Scan
- Admin enforcement enabled
- No force push

## Environments

### Staging

- Protected environment
- Single reviewer required
- 5-minute wait timer
- Deploys from develop

### Production

- Protected environment
- Two reviewers required
- 15-minute wait timer
- Admin approval required
- Deploys from main via release tags

## Security Features

### Code Security

- CodeQL analysis
- Gitleaks secret scanning
- Custom secret pattern detection
- Mobile security framework

### Dependencies

- Dependabot for Swift, Gradle, npm, GitHub Actions
- npm audit in CI

### Build Security

- SBOM generation (planned)
- Artifact signing (planned)

## Required Secrets

```yaml
# CI/CD
ANTHROPIC_API_KEY: "Claude review API key"

# iOS
APPSTORE_PRIVATE_KEY: "App Store Connect API key"
APPSTORE_KEY_ID: "4RP6S27FL2"
APPSTORE_ISSUER_ID: "9e5d7ebf-d4fe-47c2-8370-14dd87c17113"
MATCH_PASSWORD: "Fastlane match password"
MATCH_GIT_BASIC_AUTHORIZATION: "Base64 encoded git auth"

# Android
GOOGLE_PLAY_JSON_KEY: "Service account JSON"
ANDROID_KEYSTORE_BASE64: "Upload keystore"
KEYSTORE_PASSWORD: "Keystore password"
KEY_ALIAS: "Key alias"
KEY_PASSWORD: "Key password"
GOOGLE_SERVICES_JSON: "Firebase config"

# Firebase
FIREBASE_APP_ID_IOS: "Firebase iOS app ID"
FIREBASE_APP_ID_ANDROID: "Firebase Android app ID"
FIREBASE_TOKEN: "Firebase CLI token"
```

## Maintenance

### Weekly Tasks

- Review security alerts
- Audit environment access
- Review cache usage

### Monthly Tasks

- Rotate access tokens
- Review protection rules
- Update action versions
- Audit permissions
