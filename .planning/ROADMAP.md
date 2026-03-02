# Roadmap: OpenClaw Console

## Overview

This is a brownfield repair-and-validate project. The existing native iOS and Android apps are architecturally sound but the CI/CD pipeline is broken, preventing any signed testing builds from reaching devices. The path forward is sequential: repair the CI pipeline first, configure code signing and distribution second, validate the biometric approval flow on real hardware third, then harden the distribution infrastructure to make the ongoing beta loop reliable. Every phase is a prerequisite for the next — parallelization is not possible.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: CI Pipeline Repair** - Fix all CI failures so every platform workflow passes consistently
- [ ] **Phase 2: Code Signing and Distribution** - Configure signing, secrets, and store upload so signed builds reach Firebase and TestFlight automatically
- [ ] **Phase 3: Device Testing Validation** - Install signed builds on real hardware and confirm the biometric approval flow works end-to-end
- [ ] **Phase 4: Infrastructure Hardening** - Add monitoring, preflight guards, and notifications to make the beta distribution loop reliable over time

## Phase Details

### Phase 1: CI Pipeline Repair
**Goal**: Every CI workflow passes consistently on develop — skills-test, android CI, and iOS CI are all green before any distribution work begins
**Depends on**: Nothing (first phase)
**Requirements**: CI-01, CI-02, CI-03, CI-04, CI-05, CI-06
**Success Criteria** (what must be TRUE):
  1. The skills-test CI job completes successfully with no npm lockfile errors on every push
  2. The iOS CI job runs on macos-15 with Xcode 16.4 and produces a simulator build without errors
  3. The Android CI job builds a debug APK with AGP 8.7.x and Kotlin 2.1.x without errors
  4. The iOS Fastfile includes setup_ci and CI runs without keychain unlock hangs
  5. Build numbers in both apps increment automatically from GITHUB_RUN_NUMBER with no manual edits needed
**Plans**: TBD

Plans:
- [ ] 01-01: Fix npm lockfile and skills gateway CI
- [ ] 01-02: Upgrade iOS workflows to macos-15 + Xcode 16.4 and fix Fastfile
- [ ] 01-03: Upgrade Android toolchain (AGP + Kotlin + Compose BOM) and migrate Firebase auth

### Phase 2: Code Signing and Distribution
**Goal**: Signed iOS builds reach TestFlight and signed Android builds reach Firebase App Distribution automatically on every green develop push
**Depends on**: Phase 1
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05
**Success Criteria** (what must be TRUE):
  1. The Android keystore is backed up to a password manager and cannot be lost if GitHub Secrets are deleted
  2. iOS code signing works in CI via Fastlane match without any manual certificate intervention
  3. All required GitHub Secrets are present and the internal-distribution.yml workflow fires automatically after a green develop push
  4. A TestFlight build appears in App Store Connect within 15 minutes of a green iOS CI run on develop
  5. A Firebase App Distribution build appears and is installable by testers within 15 minutes of a green Android CI run on develop
**Plans**: TBD

Plans:
- [ ] 02-01: Back up Android keystore and configure SIGN-01 secrets
- [ ] 02-02: Configure Fastlane match and iOS code signing secrets
- [ ] 02-03: Wire internal-distribution.yml and verify end-to-end upload to TestFlight and Firebase

### Phase 3: Device Testing Validation
**Goal**: The biometric agent approval flow is confirmed working on real iOS and Android hardware using signed builds delivered from CI
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. A signed Android APK from Firebase App Distribution installs on a physical Android device without an "unknown sources" warning
  2. A signed iOS IPA from TestFlight installs on a real iPhone — not just a simulator
  3. Face ID on iPhone and fingerprint on Android both trigger and complete the biometric approval flow with action-specific prompts
  4. Both apps connect to the skills gateway running at localhost:18789 from a real mobile device on the same network
  5. An agent action approval request submitted through the gateway is received, reviewed, and approved or denied from the mobile device, completing the full end-to-end workflow
**Plans**: TBD

Plans:
- [ ] 03-01: Validate Android APK install and biometric flow on physical device
- [ ] 03-02: Validate iOS IPA install and biometric flow on real iPhone
- [ ] 03-03: Validate end-to-end gateway connection and approval flow from real devices

### Phase 4: Infrastructure Hardening
**Goal**: The beta distribution loop is reliable and self-monitoring — workflow_run triggers fire correctly, store metadata is validated before uploads, certificates do not expire silently, and build failures produce visible notifications
**Depends on**: Phase 3
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. After a green develop push, the internal-distribution.yml workflow appears in the Actions tab with trigger "workflow_run" — not workflow_dispatch — confirming the trigger wiring is correct
  2. Running the preflight release script on a build without complete store metadata exits non-zero and blocks the upload with a clear error message
  3. A scheduled CI job runs at least weekly and posts a notification if any iOS certificate or provisioning profile expires within 30 days
  4. A build status notification (success or failure) is delivered to a configured channel within 5 minutes of any distribution workflow completing
**Plans**: TBD

Plans:
- [ ] 04-01: Verify workflow_run trigger wiring and add preflight release script gate
- [ ] 04-02: Add certificate expiry monitoring and build status notifications

## Progress

**Execution Order:**
Phases execute sequentially: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. CI Pipeline Repair | 0/3 | Not started | - |
| 2. Code Signing and Distribution | 0/3 | Not started | - |
| 3. Device Testing Validation | 0/3 | Not started | - |
| 4. Infrastructure Hardening | 0/2 | Not started | - |
