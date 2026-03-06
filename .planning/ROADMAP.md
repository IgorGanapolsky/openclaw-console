# Roadmap: OpenClaw Console

## Overview

This is a brownfield repair project, not a greenfield build. Substantial native iOS (SwiftUI) and Android (Kotlin/Compose) app code exists with a TypeScript skills gateway, but a broken CI/CD pipeline prevents signed builds from reaching devices. The work proceeds in a strict dependency chain: fix the CI layer first, then validate signing and distribution, then confirm the biometric approval workflow works on real hardware, then harden the distribution loop for sustainable beta testing. Every phase is a prerequisite for the next. Nothing can be parallelized until Phase 1 is green.

## Phases

- [x] **Phase 1: CI Pipeline Repair** - Fix all blocking CI failures so the pipeline runs green end-to-end on develop (completed 2026-03-02)
- [ ] **Phase 2: Code Signing and Distribution** - Configure Fastlane match, keystore, and distribution lanes so signed builds reach Firebase and TestFlight automatically
- [ ] **Phase 3: Device Testing Validation** - Confirm signed builds install and the biometric approval workflow works on real physical hardware
- [ ] **Phase 4: Distribution Hardening** - Add certificate monitoring, release notes, build metadata validation, and status notifications for a sustainable beta loop

## Phase Details

### Phase 1: CI Pipeline Repair
**Goal**: All CI jobs pass consistently on every push to develop — no npm lockfile errors, no Xcode version mismatches, no FIREBASE_TOKEN deprecation warnings, and build numbers auto-increment from GITHUB_RUN_NUMBER
**Depends on**: Nothing (first phase)
**Requirements**: CI-01, CI-02, CI-03, CI-04, CI-05, CI-06
**Success Criteria** (what must be TRUE):
  1. The skills-test CI job completes successfully with `npm ci` on every develop push — no lockfile integrity errors
  2. The ios.yml workflow completes on a macos-15 runner with Xcode 16.4 without keychain hang or simulator OS version error
  3. The android.yml workflow produces a debug APK with AGP 8.7.x and Kotlin 2.1.x — no version compatibility errors
  4. Build number in the produced artifacts matches GITHUB_RUN_NUMBER (not a hardcoded value)
  5. Firebase distribution job shows no FIREBASE_TOKEN deprecation warning — service account auth succeeds
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Regenerate npm lockfile with Node 20 (CI-01)
- [x] 01-02-PLAN.md — Android toolchain upgrade + versionCode injection (CI-03, CI-06)
- [x] 01-03-PLAN.md — iOS runner upgrade to macos-15 + Fastfile setup_ci + iOS build number (CI-02, CI-04, CI-06)
- [x] 01-04-PLAN.md — Firebase auth migration to service account (CI-05)

### Phase 2: Code Signing and Distribution
**Goal**: Signed testing builds reach Firebase App Distribution and TestFlight automatically on every green develop build — testers can install the app without any manual developer intervention
**Depends on**: Phase 1
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05
**Success Criteria** (what must be TRUE):
  1. Android keystore file is backed up to a password manager and confirmed restorable — not stored only in GitHub Secrets
  2. iOS code signing via Fastlane match completes without interactive cert prompts — CI runs in readonly match mode
  3. All required GitHub Secrets (MATCH_GIT_URL, MATCH_PASSWORD, APPSTORE_KEY_ID, APPSTORE_PRIVATE_KEY, APPSTORE_ISSUER_ID, ANDROID_KEYSTORE_BASE64, FIREBASE_APP_ID) are present and valid
  4. A signed iOS IPA appears in TestFlight App Store Connect within 15 minutes of a green develop push
  5. A signed Android APK appears in Firebase App Distribution tester group within 15 minutes of a green develop push
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Android launcher icons + signingConfigs block (SIGN-01, SIGN-05 prereq)
- [x] 02-02-PLAN.md — Android keystore backup + GitHub Secrets (SIGN-01, SIGN-03)
- [x] 02-03-PLAN.md — iOS match cert repo + all iOS secrets (SIGN-02, SIGN-03)
- [ ] 02-04-PLAN.md — apksigner verification + end-to-end distribution trigger (SIGN-04, SIGN-05) [paused at human-verify checkpoint]

### Phase 3: Device Testing Validation
**Goal**: Implement revenue generation infrastructure and community positioning to achieve $100/day target through subscription billing, analytics, and DevOps professional outreach while validating core device functionality — not just simulators — so the core product value proposition is validated before beta expansion
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. The Android APK installs on a physical Android device without an "unknown sources" warning and opens without crash
  2. The iOS build installs on a real iPhone via TestFlight and Face ID biometric prompt appears with action-specific localizedReason text
  3. A biometric approval request (Face ID on iPhone, fingerprint on Android) succeeds and sends the approval response to the skills gateway at localhost:18789
  4. Both iOS and Android apps connect to localhost:18789 and display a live agent list from the skills gateway
  5. A full end-to-end approval flow completes: agent requests action, notification appears, user reviews on device, biometric verifies, gateway receives approved response
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Revenue infrastructure (billing, analytics, integrations)
- [ ] 03-02-PLAN.md — Mobile app subscription integration and device validation
- [ ] 03-03-PLAN.md — DevOps community positioning and marketing foundation
### Phase 4: Distribution Hardening
**Goal**: The beta testing loop is self-sustaining and resilient — certificate expiry is monitored proactively, release notes accompany every build, store metadata is validated before uploads, and build failures generate immediate notifications
**Depends on**: Phase 3
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. The internal-distribution.yml workflow_run trigger fires correctly after both ios.yml and android.yml succeed on develop — verified by checking the Actions tab, not just inferring from workflow file
  2. A build uploaded to Firebase or TestFlight includes auto-generated release notes from the git log since the previous build
  3. A scheduled GitHub Actions job runs weekly and reports iOS certificate and provisioning profile expiry dates — firing a warning 30+ days before expiry
  4. A build failure (signing error, upload error, or CI failure) generates a notification within 5 minutes via the configured notification channel
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Revenue infrastructure (billing, analytics, integrations)
- [ ] 03-02-PLAN.md — Mobile app subscription integration and device validation
- [ ] 03-03-PLAN.md — DevOps community positioning and marketing foundation
## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. CI Pipeline Repair | 4/4 | Complete    | 2026-03-02 |
| 2. Code Signing and Distribution | 4/4 (paused at checkpoint) | In Progress|  |
| 3. Device Testing Validation | 0/TBD | Not started | - |
| 4. Distribution Hardening | 0/TBD | Not started | - |
