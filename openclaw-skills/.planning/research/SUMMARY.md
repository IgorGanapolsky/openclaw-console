# Project Research Summary

**Project:** OpenClaw Console — Mobile App CI/CD Deployment Pipeline
**Domain:** Native mobile app CI/CD (iOS + Android) with testing distribution
**Researched:** 2026-03-02
**Confidence:** HIGH

## Executive Summary

OpenClaw Console is a brownfield dual-platform native app (Swift/SwiftUI iOS, Kotlin/Compose Android) with an existing GitHub Actions CI/CD scaffolding that has several known failure modes preventing it from working end-to-end. Experts build this class of pipeline using platform-specific jobs (macOS runners for iOS, Ubuntu for Android), Fastlane for signing and distribution automation, Fastlane match for centralized certificate management, TestFlight for iOS beta distribution, and Firebase App Distribution for Android beta distribution. The key insight from research is that this is not a greenfield pipeline design problem — it is a repair-and-validate problem with a clear dependency chain that must be resolved in order.

The recommended approach is sequential repair starting at the lowest layer: fix the npm lockfile corruption blocking the skills-test CI gate, then standardize all iOS workflows on `macos-15` + Xcode 16.x (Apple's SDK requirement since April 2025 mandates this), then upgrade Android tooling (AGP 8.7.x + Kotlin 2.1.x + Compose BOM 2025.12.00) and migrate Firebase auth from the deprecated `FIREBASE_TOKEN` to a service account. Only after the verification layer is green should distribution be validated end-to-end. The biometric approval flow — the North Star feature — cannot be validated until signed builds reach real devices.

The top risks are credential-related and silent: a lost Android keystore is unrecoverable (it cannot be regenerated — Play Store treats a new keystore as a new app), a silently mis-wired `workflow_run` trigger causes distribution to stop without any error, and expired iOS certificates block CI without clear messages. These must be addressed before any release work, not after.

---

## Key Findings

### Recommended Stack

The existing stack is sound architecturally but the version pins are stale. GitHub Actions on GitHub-hosted runners remains the correct platform for this team size. The critical upgrades are: (1) `macos-14` → `macos-15` for all iOS jobs — the old image does not have Xcode 16.x, which Apple now requires for all uploads; (2) AGP 8.2.0 → 8.7.x + Kotlin 1.9.20 → 2.1.x — both must be upgraded together because AGP 8.7.x requires Kotlin 2.0+; (3) Compose BOM `2024.01.00` → `2025.12.00` — 14 months behind current stable. Firebase auth must migrate from `FIREBASE_TOKEN` (deprecated) to a service account JSON stored as `GOOGLE_APPLICATION_CREDENTIALS`.

**Core technologies:**
- `macos-15` runner: iOS builds — Xcode 16.4 default, Swift 6 native, Apple SDK compliance
- `ubuntu-latest` runner: Android + Node.js — cheaper and faster than macOS; no macOS needed for Android
- Fastlane 2.230.0+: iOS build automation, signing, TestFlight upload — industry standard; `match` eliminates manual cert management
- `ruby/setup-ruby@v1` with `bundler-cache: true`: Ruby env for Fastlane — handles cache key invalidation correctly; do not manually cache
- AGP 8.7.x + Kotlin 2.1.x: Android build system — must upgrade together; Kotlin 2.0+ bundles Compose compiler, eliminating `kotlinCompilerExtensionVersion`
- `gradle/actions/setup-gradle@v5`: Gradle caching — official action with build scan; replace any `actions/cache` manual Gradle caching
- Firebase App Distribution + service account JSON: Android tester distribution — `FIREBASE_TOKEN` is deprecated
- TestFlight via Fastlane `upload_to_testflight` + ASC API key: iOS tester distribution — never use Apple ID + 2FA in CI
- `xcbeautify`: xcodebuild formatter — replace `xcpretty` (unmaintained); auto-detected by Fastlane 2.201.0+
- Node.js 20 LTS: skills gateway runtime — `npm ci` requires committed, valid `package-lock.json`

### Expected Features

The pipeline's MVP is getting signed testing builds to devices automatically on every push to `develop`. Everything else (PR status checks, release notes automation, crash reporting, parallel builds) is enhancement work once the core distribution loop works.

**Must have (table stakes):**
- npm dependency resolution in CI — current blocker; nothing else works until this passes
- Android debug build succeeds in CI — prerequisite for all Android testing
- iOS simulator build succeeds in CI — prerequisite for all iOS testing
- iOS code signing via Fastlane match + ASC API key — required for any device install
- Android keystore signing via GitHub Secrets — required for Firebase distribution
- Firebase App Distribution upload on develop push — delivers Android builds to testers automatically
- TestFlight upload on develop push — delivers iOS builds to testers automatically
- Build number auto-increment from `GITHUB_RUN_NUMBER` — Apple and Google both enforce monotonically increasing numbers

**Should have (competitive):**
- Unit test execution gating the build job — prevents signing and distributing broken builds
- Automatic PR builds with GitHub status checks — catches breakage before merge
- Release notes from git log — testers need context on what changed
- Crashlytics integration in beta builds — get crash data from testers, not just bug reports

**Defer (v2+):**
- Production App Store submission lane — explicitly out of scope until beta validates core workflows
- Parallel iOS + Android matrix builds — optimization; current sequential approach is functional
- Semantic versioning from git tags — useful at scale, overkill for current phase
- Cloud device farm testing (Firebase Test Lab) — cost; defer until coverage warrants it

### Architecture Approach

The existing four-layer pipeline architecture (source verification → internal distribution → production release → release tagging) is correct and well-structured. The key pattern is separation of concerns: platform-specific CI workflows (`android.yml`, `ios.yml`) run on path-filtered triggers for fast feedback; `ci.yml` enforces cross-cutting architecture bans (no force casts, no HTTP URLs) on every PR; `internal-distribution.yml` fires asynchronously via `workflow_run` only on green `develop` builds; `native-release.yml` is manual-dispatch only for production. No changes to the architecture are needed — the structure needs to be repaired, not redesigned.

**Major components:**
1. `ci.yml` (omnibus gate) — enforces architecture bans across all platforms; runs on every PR to develop/main; cannot be bypassed
2. `android.yml` / `ios.yml` / `skills.yml` — platform-specific verification; path-filtered for speed; builds debug artifacts only (no signing secrets needed)
3. `internal-distribution.yml` — downstream distribution gate; fires via `workflow_run` from iOS CI + Android CI; gate job checks branch == develop AND conclusion == success before distributing
4. `native-release.yml` / `release.yml` — manual-dispatch production pipeline; requires GitHub Environment secrets; decoupled from automatic distribution
5. `scripts/preflight-release.sh` — mandatory pre-distribution metadata validation; must never be bypassed

### Critical Pitfalls

1. **workflow_run trigger silently not firing** — The `internal-distribution.yml` matches on workflow `name:` fields. If `ios.yml` or `android.yml` are renamed, distribution stops with no error and no alert. Never rename upstream workflows without updating all `workflow_run` consumers. Verify by checking the Actions tab after a develop push — the distribution workflow must appear with trigger `workflow_run`, not just `workflow_dispatch`.

2. **npm lockfile out-of-sync blocks all CI** — `npm ci` requires exact parity between `package.json` and `package-lock.json`. Different npm versions between local and CI generate incompatible lockfile formats. Fix: run `npm install` locally in `openclaw-skills/` with the npm version matching CI (Node 20), commit the updated lockfile. Do not add `--legacy-peer-deps`.

3. **Xcode/runner version mismatch violates Apple SDK mandate** — `ios.yml` pins `macos-14` + `Xcode_15.2.app`. Apple requires Xcode 16+ and iOS 18 SDK for all uploads since April 2025. The hardcoded path `/Applications/Xcode_15.2.app` does not exist on `macos-15`. Fix: standardize all iOS jobs on `macos-15` with explicit `xcode-select -s /Applications/Xcode_16.4.app`; never hardcode simulator OS version strings.

4. **Android keystore is unrecoverable if lost** — The keystore stored as `ANDROID_KEYSTORE_BASE64` in GitHub Secrets is the only copy if the original file is not backed up. Loss means the app cannot receive updates on Google Play — it must be republished under a new bundle ID. Fix: store the `.jks` file in a password manager (1Password, Bitwarden) as a file attachment with the key alias and passwords before any CI work begins.

5. **FIREBASE_TOKEN deprecated auth will break without warning** — Firebase CLI has deprecated `--token` authentication. When `firebase-tools` removes it in a major version bump, Android distribution will fail silently. Fix: migrate to service account JSON in `GOOGLE_APPLICATION_CREDENTIALS`. The current workflow already has the fallback via `GOOGLE_PLAY_JSON_KEY` — activate it as primary and remove `FIREBASE_TOKEN`.

---

## Implications for Roadmap

The architecture research provides an explicit dependency chain that directly maps to phase order. Do not parallelize or reorder these phases — each one is a prerequisite for the next.

### Phase 1: CI Pipeline Repair

**Rationale:** The npm lockfile failure is blocking all CI. The Xcode version mismatch violates Apple's SDK requirement. The FIREBASE_TOKEN deprecation is a ticking clock. The keystore backup must happen before any CI work or it may be lost. All downstream phases depend on a green CI pipeline. This is the only phase that must complete before anything else starts.

**Delivers:** A fully green CI pipeline on `develop` — all three platform workflows pass, `internal-distribution.yml` fires automatically, signed Android APK appears in Firebase, signed iOS IPA appears in TestFlight.

**Addresses (from FEATURES.md):** npm dependency resolution, Android debug build, iOS debug build, Android signing, iOS code signing, Firebase distribution, TestFlight distribution, build number auto-increment.

**Avoids (from PITFALLS.md):** npm lockfile mismatch (P2), Xcode/runner mismatch (P7), FIREBASE_TOKEN deprecation (P6), workflow_run silent failure (P1), keystore loss (P4).

**Specific tasks:**
- Back up Android keystore + credentials to password manager
- Regenerate `package-lock.json` with Node 20 npm; commit to `openclaw-skills/`
- Upgrade all iOS workflows to `macos-15` + Xcode 16.4; remove hardcoded `Xcode_15.2.app` references
- Upgrade Android: AGP 8.2.0 → 8.7.x, Kotlin 1.9.20 → 2.1.x, Compose BOM 2024.01.00 → 2025.12.00
- Add `setup_ci` call to iOS Fastfile (missing; causes keychain freeze)
- Migrate Firebase auth from `FIREBASE_TOKEN` to service account JSON
- Automate `versionCode` from `GITHUB_RUN_NUMBER` (remove hardcoded value)
- Verify iOS certificate expiry > 30 days; rotate if needed
- Verify `workflow_run` trigger names match exact `name:` fields in `ios.yml` + `android.yml`
- Replace `xcpretty` with `xcbeautify`

**Research flag:** SKIP — all issues are fully documented with known fixes. No new research needed.

### Phase 2: Device Testing Validation

**Rationale:** A green CI pipeline is not the same as a working app on a real device. Biometric approval flow — the North Star feature — cannot be validated in a simulator. Simulator biometric simulation passes even with misconfigured `LocalAuthentication`. This phase validates that signed builds install, run, and process biometric approvals correctly on physical hardware before any beta release.

**Delivers:** Confirmation that the biometric agent approval flow works end-to-end on a real iPhone and real Android device. Firebase and TestFlight builds confirmed installable by at least one tester other than the developer.

**Addresses (from FEATURES.md):** Biometric approval validation, tester group management, unit test execution in CI.

**Avoids (from PITFALLS.md):** Simulator-only biometric testing (does not catch real hardware failures), unsigned APK distributed via Firebase, TestFlight processing timeout (use `skip_waiting_for_build_processing: true`).

**Specific tasks:**
- Test biometric approval on real iPhone with Face ID enrolled; verify `localizedReason` text is action-specific
- Test on real Android device; verify signed APK installs without "unknown sources" prompt
- Add `apksigner verify` post-build step to confirm APK is signed before distributing
- Add unit test job gating the build job in CI (tests must pass before signing)
- Add PR status check requiring CI passage before merge to `develop`

**Research flag:** SKIP — well-documented patterns. Biometric LocalAuthentication API is stable.

### Phase 3: Distribution Hardening

**Rationale:** Once testing builds reach devices and the core approval flow is validated, add the quality-of-life distribution features that reduce friction for ongoing beta testing. These are differentiators from FEATURES.md that make the pipeline maintainable over time.

**Delivers:** Automated release notes, crash reporting in beta builds, scheduled certificate expiry monitoring, PR build status checks.

**Addresses (from FEATURES.md):** Release notes per build, crash reporting (Crashlytics), PR status checks, tester group management via `vars.FIREBASE_INTERNAL_TESTERS`.

**Avoids (from PITFALLS.md):** iOS certificate expiry (add scheduled expiry check job), builds without release notes (testers reject "unknown builds" at high rate).

**Research flag:** SKIP — all standard patterns with official documentation.

### Phase 4: Production Release Infrastructure

**Rationale:** Defer until beta validates the core biometric approval workflow. Store metadata, production signing, and App Store review requirements add significant overhead that is wasted if the core feature needs design changes. Explicitly out of scope per PROJECT.md until beta is proven.

**Delivers:** `native-release.yml` working end-to-end for both App Store and Google Play production releases; `release.yml` creating versioned GitHub Releases; store listing metadata complete and validated by `preflight-release.sh`.

**Addresses (from FEATURES.md):** Production App Store submission, semantic versioning, store metadata management.

**Avoids (from PITFALLS.md):** Skipping `preflight-release.sh` (store metadata missing → App Store rejection), submitting without export compliance questionnaire (blocks external TestFlight testers).

**Research flag:** NEEDS RESEARCH — Google Play AAB publishing via `publishReleaseBundle`, App Store Connect API key scoping for production vs beta, phased rollout options.

### Phase Ordering Rationale

- Phase 1 before Phase 2: cannot test on devices without signed builds reaching devices. Signed builds require a green CI pipeline.
- Phase 2 before Phase 3: no value in hardening distribution before validating the core user action (biometric approval) works on real hardware.
- Phase 3 before Phase 4: distribution hardening ensures the beta loop is sustainable before committing to production infrastructure overhead.
- Phase 4 is explicitly deferred: production release has unique requirements (store metadata, export compliance, review timelines) that are separate concerns from the testing distribution loop.

### Research Flags

Phases needing deeper research during planning:
- **Phase 4:** Google Play `publishReleaseBundle` Gradle DSL, App Store Connect automated review submission via Fastlane, phased rollout percent configuration — sparse community documentation and frequent API changes.

Phases with standard patterns (skip research-phase):
- **Phase 1:** All fixes are documented with official sources; implementation is mechanical.
- **Phase 2:** LocalAuthentication and biometric testing patterns are stable and well-documented.
- **Phase 3:** Crashlytics integration, release notes from git log, and scheduled GitHub Actions jobs are all standard patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Version recommendations verified against official runner image manifests, official Android docs (Compose BOM), official Fastlane docs. All version-compatibility constraints (AGP + Kotlin must upgrade together) verified. |
| Features | HIGH | Feature list derived from direct inspection of existing workflows + official distribution platform docs. MVP scope aligns with explicit PROJECT.md constraints. |
| Architecture | HIGH | Based on direct codebase inspection of all 8 workflow files + Fastfiles + Matchfile. No inference needed — the architecture exists and was read. |
| Pitfalls | HIGH | All critical pitfalls verified against official documentation and known GitHub issues (fastlane, firebase-tools, runner-images repos). Apple SDK mandate (Xcode 16 requirement) confirmed from official runner-images issue tracker. |

**Overall confidence:** HIGH

### Gaps to Address

- **`internal-distribution.yml` workflow_run name match:** The exact `name:` field values in `ios.yml` and `android.yml` must be verified against what `internal-distribution.yml` expects. STACK.md notes the potential mismatch but the research was inconclusive on whether it is currently correct. Verify during Phase 1 implementation.
- **App Store Connect API key scope:** Whether the existing `APPSTORE_PRIVATE_KEY` secret has the correct permissions for both TestFlight upload and internal distribution vs production submission is not confirmed. Validate during Phase 1 by checking App Store Connect API key role against Fastlane's requirements.
- **Match cert repo existence and access:** `MATCH_GIT_URL` must point to an existing private repo accessible via `ADMIN_TOKEN`. Research could not confirm this repo exists. Verify before Phase 1 begins — if it does not exist, it must be created and certs generated before any signing work.
- **Maestro E2E on Android emulator boot:** `device-tests.yml` uses `sleep 10` to wait for emulator boot — this is fragile. The correct approach is `adb wait-for-device shell getprop sys.boot_completed`. Address in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- `github.com/actions/runner-images` — `macos-15` image manifest; Xcode 16.4 default; Ruby 3.3.10; Apple SDK mandate (Xcode 16 requirement effective April 2025)
- `docs.fastlane.tools/best-practices/continuous-integration/github/` — `setup_ci` requirement; match readonly mode; keychain management
- `docs.fastlane.tools/actions/match/` — certificate management, nuke/renew, readonly CI mode
- `developer.android.com/develop/ui/compose/bom` — Compose BOM 2026.02.01 latest stable
- `firebase.google.com/docs/app-distribution/` — service account auth; `FIREBASE_TOKEN` deprecation
- `github.com/firebase/firebase-tools/discussions/6283` — `FIREBASE_TOKEN` deprecation confirmation
- `github.com/gradle/actions` — `setup-gradle@v5` official Gradle action
- Direct codebase inspection: all `.github/workflows/*.yml`, `android/fastlane/Fastfile`, `ios/OpenClawConsole/fastlane/Fastfile`, `Matchfile`, `.planning/PROJECT.md`

### Secondary (MEDIUM confidence)
- `runway.team/blog/` — Fastlane match cert rotation workflow; iOS TestFlight + GitHub Actions setup
- `brightinventions.pl/blog/` — iOS TestFlight GitHub Actions Fastlane match 2025 patterns
- `firebase.google.com/docs/app-distribution/best-practices-distributing-android-apps-to-qa-testers-with-ci-cd` — Firebase distribution CI patterns
- `github.com/actions/setup-node/releases` — setup-node@v6.2.0 current stable

### Tertiary (LOW confidence)
- None — all findings have HIGH or MEDIUM source backing.

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
