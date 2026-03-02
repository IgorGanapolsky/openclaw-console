# Pitfalls Research

**Domain:** Native mobile app CI/CD and testing distribution (iOS + Android)
**Researched:** 2026-03-02
**Confidence:** HIGH (findings verified against official docs, fastlane issues, GitHub Actions community, Firebase docs)

---

## Critical Pitfalls

### Pitfall 1: workflow_run Trigger Silently Never Fires

**What goes wrong:**
The `internal-distribution.yml` listens for `workflow_run` events from workflows named `"iOS CI"` and `"Android CI"`. The actual workflow files are named `iOS CI` and `Android CI` in their `name:` fields — but this coupling is fragile. If either upstream workflow is renamed or the `name:` field is missing, the distribution workflow never triggers and there is no error. Builds stop deploying silently.

**Why it happens:**
`workflow_run` triggers match on the `name:` field of the upstream workflow file, not the filename. Teams often rename workflows for clarity or add/remove the `name:` field during cleanup, breaking downstream triggers without any alert.

**How to avoid:**
- Treat upstream workflow names as a public API — never rename them without updating all `workflow_run` consumers.
- Add a smoke test to the distribution workflow: on every successful `workflow_dispatch` run, verify the trigger wiring is intact.
- Document the name-to-file mapping explicitly in a comment at the top of `internal-distribution.yml`.

**Warning signs:**
- CI builds pass on `develop` but no new build appears in Firebase/TestFlight.
- The `internal-distribution.yml` workflow never appears in the Actions tab run history.
- Manual `workflow_dispatch` on distribution works, but auto-trigger does not.

**Phase to address:** CI/CD Pipeline Repair (the current phase) — verify trigger wiring before declaring pipeline fixed.

---

### Pitfall 2: npm ci Fails Due to Lockfile Out-of-Sync

**What goes wrong:**
`npm ci` requires `package.json` and `package-lock.json` to be exactly in sync. The project context explicitly calls out "npm dependency corruption" as the current CI blocker. When local development uses a different npm version than CI (e.g., npm 11.x locally vs npm 10.x on the runner), `npm ci` can reject a lockfile that is technically valid, causing 100% CI failure on the skills gateway job.

**Why it happens:**
- Developer installs or updates a package without committing the updated lockfile.
- `npm install` was run locally with a different npm version, generating a lockfile format the CI's npm version rejects.
- `node_modules/` was committed and conflicts with the clean-install expectation of `npm ci`.
- `package-lock.json` was regenerated locally on a different platform (macOS vs Linux) producing platform-specific resolution differences.

**How to avoid:**
- Pin the npm version in CI explicitly: `run: npm install -g npm@10.x` before `npm ci`, matching the version used locally.
- Always run `npm ci` (never `npm install`) in CI — it is stricter but reproducible.
- Add a lockfile lint step: verify `package-lock.json` is committed and up-to-date in pre-commit hooks.
- Never commit `node_modules/`.

**Warning signs:**
- CI error: `npm ci can only install packages when your package.json and package-lock.json are in sync`.
- Local `npm install` succeeded but CI `npm ci` failed on a PR where only non-JS files changed.
- `package-lock.json` shows frequent churn in git history without corresponding `package.json` changes.

**Phase to address:** CI/CD Pipeline Repair — fix this before any other work; it is the known blocker.

---

### Pitfall 3: iOS Code Signing Breaks Silently on Certificate Expiry

**What goes wrong:**
Apple Distribution and Development certificates expire after one year. When a certificate used by `fastlane match` expires, every CI build that hits the `fastlane setup` lane fails with a cryptic signing error. Because the certificate was valid when the pipeline was set up, the failure feels unexpected and the error messages (`No valid signing identity`) obscure the root cause.

**Why it happens:**
Teams set up `match` once and forget about certificate lifecycle. Apple also periodically rotates WWDR (Worldwide Developer Relations) intermediate certificates, causing signing failures even with valid app certificates. The `fastlane match` `readonly: true` flag (required in CI) prevents match from auto-renewing.

**How to avoid:**
- Add a calendar reminder 30 days before the distribution certificate expiry date.
- Set up a weekly scheduled GitHub Actions job that runs `fastlane match` in read-only mode and reports expiry dates — fail if any certificate expires within 30 days.
- Remove expired WWDR certificates from the match git repository before they hit CI.
- When rotating: run `fastlane match nuke distribution` locally, then `fastlane match appstore` to regenerate, then update the match git repo.

**Warning signs:**
- Xcode `Code Signing Error: No valid signing identity found` in CI logs.
- `fastlane setup` step passes but `fastlane beta` fails with `Provisioning profile doesn't include signing certificate`.
- Build works locally but fails in CI (local Keychain has the cert; CI does not).
- App Store Connect shows "Certificate is no longer valid".

**Phase to address:** CI/CD Pipeline Repair — verify certificate expiry during initial pipeline validation.

---

### Pitfall 4: Android Keystore Lost or Key Alias Mismatch

**What goes wrong:**
The Android release keystore is stored as `ANDROID_KEYSTORE_BASE64` in GitHub Secrets, decoded to `/tmp/release.keystore` at build time, then cleaned up. If the original keystore file is lost (developer laptop failure, secrets rotation without re-encoding), it is permanently unrecoverable. The app cannot be updated on Google Play — a new keystore means a new app listing. This is the Android equivalent of losing your house keys and not being able to make copies.

**Why it happens:**
The keystore lives in only one place: the developer's machine and the CI secret. There is no offsite backup enforced. Additionally, rotating secrets by encoding a freshly generated keystore (instead of the original) produces a different signing identity, breaking Play Store updates.

**How to avoid:**
- Store the original `.jks`/`.keystore` file in a password manager (1Password, Bitwarden) as a file attachment, not just base64 in GitHub Secrets.
- Store the keystore password, key alias, and key password in the same password manager entry.
- Document the exact command used to generate the keystore (`keytool -genkeypair ...`) so it can be reproduced only if intentionally starting fresh.
- Never regenerate the keystore; always use the exact same file for every build.

**Warning signs:**
- `Failed to read key ALIAS from store /tmp/release.keystore`: wrong key alias or corrupted base64.
- Google Play upload error: `APK was not signed with the correct certificate`.
- New team member re-generates the keystore thinking the old one was lost.

**Phase to address:** CI/CD Pipeline Repair — verify keystore is backed up before doing any CI work. Failure to back up now means permanent loss later.

---

### Pitfall 5: Build Number Not Incremented Automatically

**What goes wrong:**
TestFlight rejects uploads if the build number (CFBundleVersion) is the same as or lower than a previously uploaded build. Google Play rejects APKs/AABs where `versionCode` is not strictly greater than the previous upload. In both cases, the upload silently succeeds at the command level but the build never appears for testers.

**Why it happens:**
The current `Fastfile` for iOS calls `latest_testflight_build_number + 1`, which requires a valid App Store Connect API connection at build time. If that call fails (network timeout, API key misconfigured, first-ever upload), the build number does not increment and the upload is rejected. For Android, the `versionCode` is hardcoded in `build.gradle.kts` and must be manually incremented before every upload.

**How to avoid:**
- For iOS: make the `increment_build_number` call explicit with a fallback — if `latest_testflight_build_number` fails, use `GITHUB_RUN_NUMBER` as the build number.
- For Android: automate `versionCode` from `GITHUB_RUN_NUMBER` or a monotonically increasing counter stored in git (never hardcode it).
- Add a post-upload verification step: query the API to confirm the new build appears in the list before declaring success.

**Warning signs:**
- Fastlane reports success but the build does not appear in TestFlight after 30+ minutes.
- App Store Connect shows `Invalid Build` status.
- Google Play Console error: `APK specifies a version code that has already been used`.
- CI logs show `latest_testflight_build_number` returning 0 or failing silently.

**Phase to address:** CI/CD Pipeline Repair — implement automated build number management from day one.

---

### Pitfall 6: FIREBASE_TOKEN Authentication Is Deprecated

**What goes wrong:**
The current `internal-distribution.yml` uses `FIREBASE_TOKEN` for Firebase CLI authentication in CI. The Firebase team deprecated `--token` authentication and it will be removed in a future major version of `firebase-tools`. When it is removed, Android distribution CI will break with no warning until the pipeline is tested.

**Why it happens:**
`firebase login:ci` was the standard approach before Google Application Default Credentials were supported in headless environments. Many CI setups were built before the deprecation and have not been updated.

**How to avoid:**
- Migrate to service account authentication: create a GCP service account with `Firebase App Distribution Admin` role, export the JSON key, store as `GOOGLE_APPLICATION_CREDENTIALS` secret (or as `GOOGLE_PLAY_JSON_KEY` which the current workflow already handles as a fallback).
- The current workflow already has a fallback via `GOOGLE_PLAY_JSON_KEY` — prioritize making that the primary auth method.
- Remove `FIREBASE_TOKEN` usage once service account is confirmed working.

**Warning signs:**
- CI logs print `Authenticating with --token is deprecated and will be removed in a future major version of firebase-tools`.
- Firebase CLI upgrade causes CI to fail with `Unknown option: --token`.

**Phase to address:** CI/CD Pipeline Repair — the fallback already exists in the workflow; activate and test it.

---

### Pitfall 7: Xcode Version and macOS Runner Mismatch

**What goes wrong:**
`ios.yml` uses `macos-14` with `Xcode_15.2`, while `ci.yml` uses `macos-14` with `Xcode_15.4`, and `internal-distribution.yml` uses `macos-15`. These runner + Xcode version combinations are not equivalent. Builds that pass on one runner can fail on another due to simulator availability, SDK differences, or toolchain bugs. Since April 24, 2025, Apple requires all App Store uploads to be built with Xcode 16+ and the iOS 18 SDK.

**Why it happens:**
GitHub Actions runner images are updated independently of workflow files. A runner image update can change the default Xcode version, break hardcoded Xcode paths (`/Applications/Xcode_15.2.app`), or remove simulators that the build destination string references (`iPhone 15,OS=17.2` may not exist on newer images).

**How to avoid:**
- Standardize on one `runs-on` + one explicitly selected Xcode version across all iOS workflows.
- Use `macos-15` with `Xcode 16.x` for all iOS jobs to comply with Apple's SDK requirement.
- Replace hardcoded simulator destination strings with version-independent queries: `xcrun simctl list devices available | grep -m1 iPhone`.
- Pin `xcode-select -s /Applications/Xcode_16.x.app` explicitly — never rely on the default.

**Warning signs:**
- `xcodebuild: error: The requested device could not be found`.
- Build passes on one iOS workflow but fails on another.
- Upload to App Store Connect fails with `This build was built with an outdated SDK`.
- `sudo xcode-select` fails because the hardcoded path does not exist on the runner.

**Phase to address:** CI/CD Pipeline Repair — standardize Xcode/runner versions across all workflows before attempting TestFlight distribution.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding `versionCode` in `build.gradle.kts` | No external dependency at build time | Every release requires a manual file edit; easy to forget, causes Play Store rejection | Never — automate from day one |
| Using `FIREBASE_TOKEN` for Firebase CLI auth | Simple one-time setup | Deprecated, will break without warning on firebase-tools upgrade | Never in new setups — use service accounts |
| Hardcoding Xcode path (`/Applications/Xcode_15.4.app`) | Explicit, predictable | Breaks silently when GitHub runner image is updated | Never — use dynamic selection |
| Simulator-only testing for biometric flows | Fast, no real device needed | Biometric behavior differs on real hardware; approval flow may fail for real users | OK for initial smoke tests only; must test on device before beta release |
| Skipping `npm ci` cache warming | Simpler workflow | 2-4 minute slowdown on every CI run | Never once stabilized — cache-dependency-path is already configured |
| Storing the keystore only in CI secrets | Zero infrastructure overhead | Permanent loss if secrets are rotated carelessly | Never — always maintain an offline backup |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| App Store Connect API (Fastlane) | Using username/password auth instead of API key | Use App Store Connect API key (`.p8` file) — it does not expire and works without 2FA |
| Firebase App Distribution | Triggering distribution before the APK signing step completes | Always chain: build signed APK -> verify signing -> distribute; never use unsigned APK |
| `fastlane match` on CI | Running without `readonly: true` flag | Always set `readonly: true` in CI; only run without readonly locally when rotating certs |
| Google Play API | Using personal Google account instead of service account | Create a dedicated service account in Google Play Console with `Release Manager` role |
| TestFlight external testers | Submitting for external beta before export compliance is filled in | Comply with encryption export questionnaire at first submission; subsequent builds use the same answer |
| Maestro E2E tests on Android emulator | Running tests before `adb wait-for-device shell getprop sys.boot_completed` returns `1` | Add an explicit boot completion check, not just a `sleep 10` — the current workflow's `sleep 10` is fragile |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No Gradle build cache in Android CI | Full rebuild on every run (5-8 min) | Use `gradle/actions/setup-gradle@v5` with default caching — already present in most workflows | Every run; costs build minutes and delays distribution |
| No AVD cache in device test workflow | Emulator creation takes 3-5 min extra on every run | The `device-tests.yml` already has `actions/cache@v4` for AVD — verify cache hit rate | Every run where the cache key misses |
| Running all CI jobs on every push | Wastes macOS runner minutes (expensive) | Path filters are already in place on `ios.yml` and `android.yml` — preserve them | Immediately if path filters are removed |
| TestFlight processing wait in pipeline | Build job is blocked for 15-30 min waiting for Apple processing | Use `skip_waiting_for_build_processing: true` in upload_to_testflight and handle async | Every TestFlight upload; can cause CI timeout |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Approving agent actions without biometric verification | Core security invariant violated — any attacker with phone access can approve dangerous actions | Biometric check MUST gate every approval path; no UI bypass; test both Face ID success and failure paths on real hardware |
| Keystore password stored in plaintext in workflow environment | Signing credentials leaked in CI logs if `set -x` is active or if step output is captured | Use GitHub Secrets exclusively; never echo signing credentials; the cleanup step at the end of distribution workflows is correct and must not be removed |
| Committing `google-services.json` to the repository | Firebase project credentials exposed publicly | The `device-tests.yml` generates a dummy placeholder correctly — never commit the real file; verify `.gitignore` covers `android/app/google-services.json` |
| Using HTTP (not HTTPS) for gateway connections | Man-in-the-middle attack on agent approval traffic | The architecture rules already mandate TLS; the `lint-swift` CI check already flags HTTP URLs — maintain this check |
| Storing match certificates repo token with write access in CI | CI compromise allows overwriting signing certificates | Use a read-only deploy token for the match repo in CI; only use write-capable tokens locally when rotating certs |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| TestFlight invite email goes to spam | Beta testers never receive the install link, blocking all validation | Use Firebase App Distribution for Android (email invite + direct link) and ensure TestFlight testers add the Apple address to their contacts |
| Build distributed without release notes | Testers cannot tell what changed; reject rate on "unknown builds" is high | Always populate release notes from `GITHUB_SHA` + milestone description; the current workflow passes SHA in release notes which is minimal — add a one-liner description |
| Approval notification arrives but app not installed | User opens phone, sees notification, taps it, but app is not installed; trust lost immediately | Distribute testing builds aggressively to all team devices; verify install before first real agent action |
| Biometric prompt shows generic system text | User does not understand why biometric is being requested | Add explicit `localizedReason` text: "Verify your identity to approve [action name]" — not just "Authenticate" |
| Distribution succeeds but tester on Android receives unsigned APK | App installation blocked by Android's "install from unknown sources" prompting or keystore mismatch error | Always distribute signed release APK (not debug) from Firebase App Distribution; debug APKs skip signing checks that production will enforce |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **CI passes on green:** A green CI run does not mean distribution works. Verify: did a build actually appear in Firebase/TestFlight after the last green `develop` push?
- [ ] **Fastlane setup lane ran successfully:** A passing `fastlane setup` only means match fetched certificates. Verify: does the certificate have at least 30 days before expiry?
- [ ] **Android keystore decoded successfully:** The decode step exits 0 even with corrupted base64. Verify: run `keytool -list -keystore /tmp/release.keystore` after decode to confirm it is readable.
- [ ] **Firebase distribution step exited 0:** Firebase CLI may print success even if the upload was queued but not processed. Verify: check the Firebase Console for the new release with the correct SHA.
- [ ] **TestFlight upload completed:** `upload_to_testflight` exiting 0 means upload succeeded, not that processing completed. Verify: build appears in App Store Connect with status "Ready to Test" (not "Processing").
- [ ] **Biometric approval tested on real device:** Simulator biometric simulation passes even with misconfigured `LocalAuthentication` policies. Verify: test on a real iPhone with Face ID enrolled.
- [ ] **Build number incremented:** CI reports success but the build may already exist. Verify: the build number in App Store Connect or Firebase is higher than the previous release.
- [ ] **internal-distribution.yml actually triggered:** Workflow ran is not the same as workflow was triggered by CI. Verify: check the Actions tab and confirm the trigger was `workflow_run`, not `workflow_dispatch`.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Expired iOS certificate | MEDIUM | Run `fastlane match nuke distribution` locally, then `fastlane match appstore`, update MATCH_GIT_URL repo, re-run CI |
| Corrupted npm lockfile | LOW | Run `npm install` locally, commit updated `package-lock.json`, push — CI unblocks immediately |
| Lost Android keystore | HIGH | Cannot update existing Play Store listing; must publish as a new app with a new bundle ID and migrate users |
| Build number collision (iOS) | LOW | Manually increment `CURRENT_PROJECT_VERSION` in Xcode, push, re-run |
| Build number collision (Android) | LOW | Increment `versionCode` in `build.gradle.kts`, push, re-run |
| `workflow_run` not triggering distribution | LOW | Run distribution manually via `workflow_dispatch`; then fix workflow name mismatch and push |
| Firebase token rejected after deprecation | MEDIUM | Create service account, grant `Firebase App Distribution Admin`, export JSON, store as `GOOGLE_PLAY_JSON_KEY` secret, remove `FIREBASE_TOKEN` secret |
| Xcode path broken by runner image update | LOW | Update `xcode-select -s` path in workflow to the correct version available on the new runner image |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| workflow_run trigger silently not firing | Phase 1: CI Pipeline Repair | Confirm distribution workflow appears in Actions history after a real push to `develop` |
| npm lockfile out-of-sync | Phase 1: CI Pipeline Repair | `npm ci` passes in CI without any manual intervention |
| iOS certificate expired | Phase 1: CI Pipeline Repair | Certificate expiry date confirmed > 30 days out; scheduled expiry check job running |
| Android keystore lost | Phase 1: CI Pipeline Repair | Keystore + credentials documented and stored in password manager before any CI work |
| Build number not auto-incremented | Phase 1: CI Pipeline Repair | Two consecutive pushes to `develop` produce builds with monotonically increasing build numbers |
| FIREBASE_TOKEN deprecated | Phase 1: CI Pipeline Repair | Distribution uses service account auth; `FIREBASE_TOKEN` secret removed |
| Xcode/runner version mismatch | Phase 1: CI Pipeline Repair | All iOS workflows use the same `runs-on` + same Xcode version; no hardcoded simulator OS strings |
| Biometric not testable in simulator | Phase 2: Device Testing | Approval flow verified manually on a real enrolled iPhone before beta release |
| Unsigned APK distributed | Phase 2: Device Testing | Firebase distribution always uses signed release APK; verified via `apksigner verify` |
| TestFlight processing timeout | Phase 2: Device Testing | Upload uses `skip_waiting_for_build_processing: true`; post-deploy check queries API for build status |

---

## Sources

- [fastlane match documentation](https://docs.fastlane.tools/actions/match/) — certificate management, readonly CI mode, nuke/renew process (HIGH confidence)
- [fastlane match common code signing issues](https://docs.fastlane.tools/codesigning/common-issues/) — CI keychain setup, WWDR expiry (HIGH confidence)
- [Firebase App Distribution best practices for Android CI/CD](https://firebase.google.com/docs/app-distribution/best-practices-distributing-android-apps-to-qa-testers-with-ci-cd) — distribution setup, tester management (HIGH confidence)
- [Firebase CLI auth deprecation discussion](https://github.com/firebase/firebase-tools/discussions/6283) — FIREBASE_TOKEN deprecation, migration to service accounts (HIGH confidence)
- [GitHub Actions runner-images: iOS 18 SDK compliance requirement](https://github.com/actions/runner-images/issues/11984) — Apple SDK mandate effective April 2025, Xcode 16 requirement (HIGH confidence)
- [GitHub Actions runner-images: Xcode 16 simulator architecture errors](https://github.com/actions/runner-images/issues/10679) — arm64/x86_64 mismatch on Apple Silicon runners (HIGH confidence)
- [fastlane/fastlane: upload_to_testflight hangs waiting for processing](https://github.com/fastlane/fastlane/issues/20645) — known issue with Fastlane blocking on Apple processing (MEDIUM confidence)
- [npm/cli: npm ci fails with lockfile out-of-sync](https://github.com/npm/cli/issues/8693) — cross-version npm lockfile rejection (HIGH confidence)
- [Android versioning — Google Developer docs](https://developer.android.com/studio/publish/versioning) — versionCode requirements, Play Store limits (HIGH confidence)
- [Runway blog: Automate iOS code signing renewal with fastlane match](https://www.runway.team/blog/automate-ios-code-signing-renewal-fastlane-match) — annual cert rotation workflow (MEDIUM confidence)

---

*Pitfalls research for: Native mobile app CI/CD and testing distribution (OpenClaw Console)*
*Researched: 2026-03-02*
