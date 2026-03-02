# Requirements: OpenClaw Console

**Defined:** 2026-03-02
**Core Value:** Users can install and use the mobile console to approve real OpenClaw agent actions on their phone with biometric verification

## v1 Requirements

Requirements for unblocking testing builds and validating core biometric approval workflow.

### CI Pipeline Repair

- [x] **CI-01**: npm lockfile corruption fixed - skills-test CI job passes consistently
- [x] **CI-02**: iOS workflows upgraded to macOS-15 + Xcode 16.4 (Apple SDK mandate)
- [x] **CI-03**: Android toolchain upgraded (AGP 8.7.x + Kotlin 2.1.x + Compose BOM 2025.12.00)
- [x] **CI-04**: iOS Fastfile includes setup_ci call to prevent keychain unlock hangs
- [x] **CI-05**: Firebase auth migrated from deprecated FIREBASE_TOKEN to service account
- [x] **CI-06**: Build numbers auto-increment from GITHUB_RUN_NUMBER for store submissions

### Code Signing & Distribution

- [ ] **SIGN-01**: Android keystore backed up securely (prevents irreversible app loss)
- [ ] **SIGN-02**: iOS code signing configured via Fastlane match with private cert repo
- [ ] **SIGN-03**: GitHub Secrets configured (MATCH_GIT_URL, MATCH_PASSWORD, APPSTORE_KEY_ID, etc.)
- [ ] **SIGN-04**: TestFlight upload workflow functional - iOS builds reach App Store Connect
- [ ] **SIGN-05**: Firebase App Distribution upload functional - Android builds reach Firebase

### Device Testing Validation

- [ ] **TEST-01**: Android debug APK builds and installs on physical devices/emulators
- [ ] **TEST-02**: iOS debug build installs on real iOS devices (not just simulator)
- [ ] **TEST-03**: Biometric approval workflow tested on real hardware (Face ID/TouchID/Fingerprint)
- [ ] **TEST-04**: You can install both apps and connect to localhost:18789 skills gateway
- [ ] **TEST-05**: Full end-to-end agent approval flow works from real mobile devices

### Infrastructure Hardening

- [ ] **INFRA-01**: workflow_run triggers verified - internal-distribution.yml activates correctly
- [ ] **INFRA-02**: Preflight release script validates store metadata before uploads
- [ ] **INFRA-03**: Certificate expiry monitoring prevents silent signing failures
- [ ] **INFRA-04**: Build status notifications for deployment success/failure

## v2 Requirements

Deferred to future release after core approval workflow validated.

### Production Release
- **PROD-01**: App Store production upload lane (native-release.yml)
- **PROD-02**: Google Play production upload with app signing key
- **PROD-03**: Release notes automation from git commits
- **PROD-04**: Crashlytics integration for production error tracking

### Developer Experience
- **DEV-01**: PR status checks gate on all CI jobs
- **DEV-02**: Unit test coverage reporting
- **DEV-03**: Automated dependency updates via Dependabot
- **DEV-04**: E2E Maestro tests on develop branch merges

## Out of Scope

Explicitly excluded to maintain focus on core deployment pipeline.

| Feature | Reason |
|---------|--------|
| Docker containerization for iOS | Apple doesn't support macOS in Docker - invalid path |
| E2E tests on every commit | Creates 45-minute pipelines - anti-pattern per research |
| Third-party CI platforms | GitHub Actions already handles orchestration |
| Production App Store release | Defer until beta testing validates biometric workflow |
| Advanced Crashlytics features | Core error tracking sufficient for v1 |
| Multi-environment deployments | Single testing environment sufficient initially |

## Traceability

Coverage validated during roadmap creation (2026-03-02).

| Requirement | Phase | Status |
|-------------|-------|--------|
| CI-01 | Phase 1 - CI Pipeline Repair | Complete |
| CI-02 | Phase 1 - CI Pipeline Repair | Complete |
| CI-03 | Phase 1 - CI Pipeline Repair | Complete |
| CI-04 | Phase 1 - CI Pipeline Repair | Complete |
| CI-05 | Phase 1 - CI Pipeline Repair | Complete |
| CI-06 | Phase 1 - CI Pipeline Repair | Complete |
| SIGN-01 | Phase 2 - Code Signing and Distribution | Pending |
| SIGN-02 | Phase 2 - Code Signing and Distribution | Pending |
| SIGN-03 | Phase 2 - Code Signing and Distribution | Pending |
| SIGN-04 | Phase 2 - Code Signing and Distribution | Pending |
| SIGN-05 | Phase 2 - Code Signing and Distribution | Pending |
| TEST-01 | Phase 3 - Device Testing Validation | Pending |
| TEST-02 | Phase 3 - Device Testing Validation | Pending |
| TEST-03 | Phase 3 - Device Testing Validation | Pending |
| TEST-04 | Phase 3 - Device Testing Validation | Pending |
| TEST-05 | Phase 3 - Device Testing Validation | Pending |
| INFRA-01 | Phase 4 - Distribution Hardening | Pending |
| INFRA-02 | Phase 4 - Distribution Hardening | Pending |
| INFRA-03 | Phase 4 - Distribution Hardening | Pending |
| INFRA-04 | Phase 4 - Distribution Hardening | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — CI-03 and CI-06 marked complete after plan 01-02 execution*
