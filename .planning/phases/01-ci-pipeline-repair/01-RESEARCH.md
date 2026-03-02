# Phase 1: CI Pipeline Repair - Research

**Researched:** 2026-03-02
**Domain:** GitHub Actions CI/CD — npm lockfile, Xcode/iOS CI, Android toolchain, Firebase App Distribution auth, build number injection
**Confidence:** HIGH (for most domains; see confidence breakdown)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CI-01 | npm lockfile corruption fixed — skills-test CI job passes consistently | Root cause: lockfileVersion 3 + node_modules in repo. Fix: regenerate lock file with correct Node version, pin cache-dependency-path. |
| CI-02 | iOS workflows upgraded to macOS-15 + Xcode 16.4 | macos-15 runner GA, Xcode 16.4 is the default on that image. ios.yml currently uses macos-14 + Xcode 15.2. ci.yml uses macos-14 + Xcode_15.4.app. Both must be updated. |
| CI-03 | Android toolchain upgraded (AGP 8.7.x + Kotlin 2.1.x + Compose BOM 2025.12.00) | build.gradle.kts currently has AGP 8.6.0 + Kotlin 2.0.21 + Compose BOM 2024.01.00. Gradle wrapper is already 8.10.2 (meets AGP 8.7 minimum of 8.9). |
| CI-04 | iOS Fastfile includes setup_ci call to prevent keychain unlock hangs | Fastfile currently missing setup_ci. Must add `setup_ci if ENV['CI']` before any code signing step. |
| CI-05 | Firebase auth migrated from deprecated FIREBASE_TOKEN to service account | internal-distribution.yml uses FIREBASE_TOKEN as primary auth. Must migrate to GOOGLE_APPLICATION_CREDENTIALS with a service account JSON key. |
| CI-06 | Build numbers auto-increment from GITHUB_RUN_NUMBER for store submissions | Android versionCode hardcoded to 1 in app/build.gradle.kts. iOS uses `latest_testflight_build_number + 1` (requires App Store Connect access in CI). Must inject GITHUB_RUN_NUMBER instead. |
</phase_requirements>

---

## Summary

Phase 1 targets six discrete CI failures, all of which block delivery of testable builds. The work falls into five technical sub-domains: Node.js lockfile hygiene, GitHub Actions runner image selection, Android Gradle toolchain versioning, Fastlane iOS keychain setup, and Firebase App Distribution authentication migration.

The most structurally significant change is the Firebase auth migration (CI-05): the current `internal-distribution.yml` uses `FIREBASE_TOKEN` (deprecated in firebase-tools; warning promoted to error in future major versions). The replacement is `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account JSON key. The existing workflow already contains a partial fallback using `GOOGLE_APPLICATION_CREDENTIALS` when `GOOGLE_PLAY_JSON_KEY` is set — this pattern is correct and must be made the primary path.

The Android toolchain upgrade (CI-03) requires bumping AGP from 8.6.0 to 8.7.3, Kotlin from 2.0.21 to 2.1.x, and Compose BOM from 2024.01.00 to 2025.12.00. The Gradle wrapper is already at 8.10.2, which satisfies AGP 8.7's minimum of Gradle 8.9. No Gradle wrapper change needed. The iOS upgrade (CI-02) is a runner image swap from macos-14 to macos-15 and a path change from Xcode 15.2 to the default Xcode 16.4.

**Primary recommendation:** Address each CI failure as an independent, atomic change in the order: CI-01 (unblocks all skills tests), CI-02/CI-04 (iOS runner + Fastlane setup_ci together since both touch ios.yml and Fastfile), CI-03 (Android toolchain), CI-05 (Firebase auth), CI-06 (build number injection).

---

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Actions | N/A | CI orchestration | Already in use; macos-15 runner is GA as of April 2025 |
| Xcode | 16.4 | iOS builds | Default on macos-15; required by Apple SDK mandate |
| Android Gradle Plugin (AGP) | 8.7.3 | Android build system | Latest stable in 8.7.x series; minimum for Kotlin 2.1 is AGP 8.6 |
| Kotlin | 2.1.21 | Android language compiler | Latest Kotlin 2.1.x; compatible with AGP 8.7 and Gradle 8.10 |
| Gradle | 8.10.2 | Build orchestration | Already in gradle-wrapper.properties; satisfies AGP 8.7 minimum (8.9) |
| Compose BOM | 2025.12.00 | Jetpack Compose version management | Aligns all Compose libraries; maps to material3:1.4.0, ui:1.10.0 |
| Fastlane | latest gem | iOS code signing and TestFlight upload | Standard for Apple CI pipelines |
| Firebase CLI | latest npm | Android App Distribution | Official Google tooling |
| Node.js | 20 LTS | Skills gateway runtime and CI test environment | Matches engines field in package.json |
| npm | 10.x (bundled with Node 20) | Package management | Used by npm ci in skills-test job |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| actions/setup-node | v6 | Node.js version pinning in CI | Skills test job |
| actions/setup-java | v5 | JDK 17 for Android builds | Android build and lint jobs |
| gradle/actions/setup-gradle | v5 | Gradle dependency caching | Android jobs |
| ruby/setup-ruby | v1 | Ruby + Bundler for Fastlane | iOS distribution jobs |
| xcpretty | latest gem | Readable xcodebuild output | iOS build steps |
| setup-xcode action | marketplace | Pin Xcode version explicitly | When default is not desired |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GOOGLE_APPLICATION_CREDENTIALS service account | FIREBASE_TOKEN | FIREBASE_TOKEN is deprecated; service account is permanent and scoped |
| GITHUB_RUN_NUMBER for build number | external counter service | GITHUB_RUN_NUMBER is built-in, zero-dependency, monotonically increasing per workflow |
| AGP 8.7.3 | AGP 8.8+ or 8.9+ | 8.7.x is the target per requirements; 8.8+ introduces additional migration cost not in scope |

---

## Architecture Patterns

### Recommended Workflow Structure
```
.github/workflows/
├── ci.yml              # skills-test + architecture lint (ubuntu); ios-build (macos-15); android-build (ubuntu)
├── ios.yml             # iOS build-and-test (macos-15, Xcode 16.4) + lint
├── android.yml         # Android build-and-test + lint (ubuntu)
├── internal-distribution.yml   # Distribution triggered on workflow_run success on develop
└── skills.yml          # openclaw-skills CI (ubuntu, Node 20)
```

### Pattern 1: npm ci Lockfile Integrity Fix
**What:** Regenerate package-lock.json with the same Node version as CI (Node 20) to prevent integrity hash mismatches.
**When to use:** Any time npm ci fails with "integrity checksum failed" or "package.json and package-lock.json are out of sync."
**Root cause in this project:** package-lock.json has `lockfileVersion: 3` (correct for npm 7+). The failure is caused by a mismatch between the node_modules tree state committed locally (npm may have been run with a different Node version) vs the registry-sourced hashes.
**Fix:**
```bash
# Run locally with Node 20 to regenerate lock file
cd openclaw-skills
rm -rf node_modules package-lock.json
npm install           # regenerates package-lock.json with lockfileVersion 3
git add package-lock.json
git commit -m "fix(skills): regenerate package-lock.json with Node 20"
```
Then ci.yml and skills.yml already set `cache-dependency-path: openclaw-skills/package-lock.json` — this is correct.

### Pattern 2: iOS Runner Upgrade (macos-14 → macos-15, Xcode 15.2 → 16.4)
**What:** Change `runs-on` from `macos-14` to `macos-15` and remove explicit Xcode path selection (16.4 is default on macos-15).
**When to use:** CI-02. Applies to both ios.yml and the ios-build job in ci.yml.
**Current state (ios.yml):**
```yaml
runs-on: macos-14
steps:
  - name: Select Xcode 15.2
    run: sudo xcode-select -s /Applications/Xcode_15.2.app
  - name: Resolve Swift packages
    run: xcodebuild -resolvePackageDependencies -scheme OpenClawConsole -destination 'platform=iOS Simulator,name=iPhone 15,OS=17.2'
```
**Fixed state:**
```yaml
runs-on: macos-15
steps:
  # No xcode-select needed — 16.4 is default
  - name: Resolve Swift packages
    run: xcodebuild -resolvePackageDependencies -scheme OpenClawConsole -destination 'platform=iOS Simulator,name=iPhone 16'
  # Remove OS=17.2 — simulator runtimes for Xcode 16.3 and older deprecated Jan 12 2026
```
**Also fix ci.yml ios-build job:**
```yaml
# Before:
runs-on: macos-14
- name: Select Xcode
  run: sudo xcode-select -s /Applications/Xcode_15.4.app

# After:
runs-on: macos-15
# No xcode-select step needed
```

### Pattern 3: Fastlane setup_ci (CI-04)
**What:** Add `setup_ci if ENV['CI']` to Fastfile before any code signing lane runs. This creates a temporary keychain that prevents GUI keychain unlock prompts from hanging headless CI.
**Source:** https://docs.fastlane.tools/best-practices/continuous-integration/github/
**Current Fastfile (missing setup_ci):**
```ruby
lane :beta do
  increment_build_number(...)
  build_app(scheme: "OpenClawConsole")
  upload_to_testflight
end
```
**Fixed Fastfile:**
```ruby
before_all do
  setup_ci if ENV['CI']
end

lane :beta do
  increment_build_number(
    build_number: ENV['BUILD_NUMBER'] || (latest_testflight_build_number + 1)
  )
  build_app(scheme: "OpenClawConsole")
  upload_to_testflight
end
```

### Pattern 4: Android Toolchain Upgrade (CI-03)
**What:** Bump AGP from 8.6.0 → 8.7.3, Kotlin from 2.0.21 → 2.1.21, Compose BOM from 2024.01.00 → 2025.12.00.
**Compatibility verified:** Kotlin 2.1 requires minimum AGP 8.6 (met). Gradle 8.10.2 already satisfies AGP 8.7's minimum of Gradle 8.9.
**android/build.gradle.kts current:**
```kotlin
id("com.android.application") version "8.6.0" apply false
id("org.jetbrains.kotlin.android") version "2.0.21" apply false
id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
```
**android/build.gradle.kts target:**
```kotlin
id("com.android.application") version "8.7.3" apply false
id("org.jetbrains.kotlin.android") version "2.1.21" apply false
id("org.jetbrains.kotlin.plugin.serialization") version "2.1.21" apply false
id("org.jetbrains.kotlin.plugin.compose") version "2.1.21" apply false
```
**android/app/build.gradle.kts BOM change:**
```kotlin
// Before:
val composeBom = platform("androidx.compose:compose-bom:2024.01.00")
// After:
val composeBom = platform("androidx.compose:compose-bom:2025.12.00")
```

### Pattern 5: Firebase Auth Migration — FIREBASE_TOKEN → Service Account (CI-05)
**What:** Replace `FIREBASE_TOKEN` with `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON key).
**Source:** https://firebase.google.com/docs/app-distribution/authenticate-service-account
**Current flow in internal-distribution.yml:**
```yaml
env:
  FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
run: |
  if [ -n "${FIREBASE_TOKEN:-}" ]; then
    "${CMD[@]}" --token "$FIREBASE_TOKEN"
  elif [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]...
```
**Target flow:**
```yaml
- name: Write Firebase service account key
  env:
    FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
  run: |
    CREDENTIALS_FILE="${RUNNER_TEMP}/firebase-sa.json"
    echo "$FIREBASE_SERVICE_ACCOUNT_JSON" > "$CREDENTIALS_FILE"
    echo "GOOGLE_APPLICATION_CREDENTIALS=$CREDENTIALS_FILE" >> "$GITHUB_ENV"

- name: Distribute to internal Firebase tester(s)
  env:
    FIREBASE_APP_ID: ${{ steps.firebase.outputs.app_id }}
    FIREBASE_INTERNAL_TESTERS: ${{ vars.FIREBASE_INTERNAL_TESTERS }}
  run: |
    TESTERS="${FIREBASE_INTERNAL_TESTERS:-iganapolsky@gmail.com}"
    firebase appdistribution:distribute \
      android/app/build/outputs/apk/release/app-release.apk \
      --app "$FIREBASE_APP_ID" \
      --testers "$TESTERS" \
      --release-notes "Internal auto-distribution from develop (${GITHUB_SHA})"
    # No --token flag; GOOGLE_APPLICATION_CREDENTIALS env var is used automatically
```
**New GitHub Secret required:** `FIREBASE_SERVICE_ACCOUNT_JSON` — a JSON service account key with role `Firebase App Distribution Admin` from Google Cloud Console.
**Old secret:** `FIREBASE_TOKEN` can be removed after migration is verified.

### Pattern 6: Build Number Injection from GITHUB_RUN_NUMBER (CI-06)
**What:** Replace hardcoded build number with `GITHUB_RUN_NUMBER` in both Android and iOS.
**Android — app/build.gradle.kts:**
```kotlin
defaultConfig {
    // Before:
    versionCode = 1
    // After:
    versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
    versionName = "1.0"
}
```
**iOS — Fastfile:**
```ruby
before_all do
  setup_ci if ENV['CI']
end

lane :beta do
  build_number = ENV['BUILD_NUMBER'] || ENV['GITHUB_RUN_NUMBER'] || (latest_testflight_build_number + 1).to_s
  increment_build_number(build_number: build_number)
  build_app(scheme: "OpenClawConsole")
  upload_to_testflight
end
```
**Workflow injection — internal-distribution.yml iOS job:**
```yaml
- name: Build and upload to TestFlight
  env:
    BUILD_NUMBER: ${{ github.run_number }}
    ...
  run: fastlane beta
```

### Anti-Patterns to Avoid
- **Pinning Xcode via absolute path on macos-15:** `/Applications/Xcode_15.2.app` does not exist on macos-15; use the default (16.4) or `maxim-lobanov/setup-xcode` action.
- **Setting OS=17.2 in simulator destination on macos-15:** Simulator runtimes for Xcode 16.3 and older were deprecated on macos-15 starting January 12, 2026. Remove OS pinning and use device name only.
- **Keeping `--token "$FIREBASE_TOKEN"` as fallback indefinitely:** The warning will become an error in a future firebase-tools major version. Remove the FIREBASE_TOKEN path entirely once service account is verified.
- **Hardcoding GITHUB_RUN_NUMBER offset:** Do not add arbitrary offsets unless the current store versionCode is already above 1. versionCode must be strictly monotonically increasing — offsets can only be added forward, never removed.
- **Regenerating lockfile in CI with `npm install` instead of fixing locally:** This masks the root cause and forces CI to regenerate on every run, losing determinism.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keychain unlocking in headless CI | Custom keychain scripts in workflow YAML | `setup_ci` Fastlane action | Fastlane handles temp keychain lifecycle, cleanup, and edge cases correctly |
| Firebase auth credential rotation | Custom token refresh scripts | `GOOGLE_APPLICATION_CREDENTIALS` with service account JSON | GCP ADC (Application Default Credentials) handles token refresh automatically |
| Build number tracking | External counter DB or GitHub issue counter | `github.run_number` context variable | Zero-dependency, free, always available in GitHub Actions |
| npm integrity repair | Custom hash regeneration scripts | `npm install` locally to regenerate lock file | npm 7+ manages lockfileVersion 3 hashes correctly via normal install |
| Xcode version selection | Manual `xcode-select` paths | Use `macos-15` default (16.4) or `maxim-lobanov/setup-xcode` | Image defaults are tested and maintained by GitHub |

**Key insight:** All five problems in this phase have first-class solutions provided by the toolchain. The failures are all caused by stale configuration, not missing functionality.

---

## Common Pitfalls

### Pitfall 1: Simulator OS Version Pinned to Removed Runtime
**What goes wrong:** `xcodebuild` fails with "The requested device could not be found because no available devices matched the request: ... OS=17.2" on macos-15 runners.
**Why it happens:** macos-15 + Xcode 16.4 ships with iOS 18.x simulator runtimes. The iOS 17.2 runtime is not available by default. GitHub deprecated simulator runtimes for Xcode 16.3 and older on macos-15 starting January 12, 2026.
**How to avoid:** Remove `OS=17.2` from all `-destination` flags. Use device name only: `'platform=iOS Simulator,name=iPhone 16'`.
**Warning signs:** `xcodebuild: error: The requested device could not be found`

### Pitfall 2: Xcode_15.x.app Path Missing on macos-15
**What goes wrong:** `sudo xcode-select -s /Applications/Xcode_15.2.app` exits with error; build fails immediately.
**Why it happens:** macos-15 images only ship with Xcode 16.x. Xcode 15.x paths were not backported.
**How to avoid:** Remove `xcode-select` step entirely for macos-15 (16.4 is default). If explicit version pinning is needed, use the `maxim-lobanov/setup-xcode` action.
**Warning signs:** `xcode-select: error: invalid developer directory '/Applications/Xcode_15.2.app'`

### Pitfall 3: npm ci Lockfile Mismatch After Node Version Drift
**What goes wrong:** `npm ci` exits with "integrity checksum failed" or "cannot find package".
**Why it happens:** The package-lock.json was committed after running `npm install` with a different Node version than what CI uses (Node 20 in CI). This produces different resolved URLs or integrity hashes in lockfileVersion 3 format.
**How to avoid:** Always regenerate package-lock.json with Node 20 before committing. Use `npm ci` locally against Node 20 to verify before pushing.
**Warning signs:** `npm ERR! code EINTEGRITY` or `npm ERR! Lockfile integrity mismatch`

### Pitfall 4: Fastlane build_app Hangs at Code Signing Without setup_ci
**What goes wrong:** The `build_app` step in `fastlane beta` hangs indefinitely with no output on GitHub Actions.
**Why it happens:** Xcode attempts to unlock the login keychain during code signing. In a headless CI environment, the GUI prompt hangs waiting for user input. `setup_ci` creates a temporary keychain that avoids this path.
**How to avoid:** Call `setup_ci if ENV['CI']` in a `before_all` block in the Fastfile.
**Warning signs:** `build_app` step runs for >10 minutes with no log output; job times out.

### Pitfall 5: FIREBASE_TOKEN Deprecation Warning Treated as Error
**What goes wrong:** Firebase distribution step logs "Authenticating with FIREBASE_TOKEN is deprecated and will be removed in a future major version of firebase-tools." Depending on firebase-tools version, this may already be promoted to an error.
**Why it happens:** firebase-tools deprecated the `--token` flag in favor of Application Default Credentials.
**How to avoid:** Migrate to service account via `GOOGLE_APPLICATION_CREDENTIALS` before it becomes a hard error. Create a Firebase service account key with the `Firebase App Distribution Admin` IAM role and store as a GitHub Secret.
**Warning signs:** Firebase CLI warning message in CI logs; potential exit code 1 in newer firebase-tools versions.

### Pitfall 6: GITHUB_RUN_NUMBER Not Available in Fastlane ENV
**What goes wrong:** `ENV['GITHUB_RUN_NUMBER']` is nil inside fastlane because the workflow step didn't explicitly pass it as an env var.
**Why it happens:** Fastlane runs as a subprocess; GitHub Actions injects `GITHUB_RUN_NUMBER` into the shell environment, but Fastlane may not inherit all env vars depending on how it's invoked.
**How to avoid:** Explicitly pass `BUILD_NUMBER: ${{ github.run_number }}` in the workflow step's `env:` block, then read `ENV['BUILD_NUMBER']` in Fastfile.
**Warning signs:** Fastlane uses `latest_testflight_build_number + 1` instead of run number; build number in artifact does not match run number.

---

## Code Examples

### skills-test job in ci.yml (after fix)
```yaml
# Source: current ci.yml — no change needed to Node setup if lock file is regenerated correctly
skills-test:
  name: Skills Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v6
      with:
        node-version: "20"
        cache: "npm"
        cache-dependency-path: "openclaw-skills/package-lock.json"
    - name: Install dependencies
      working-directory: openclaw-skills
      run: npm ci    # succeeds once package-lock.json is regenerated with Node 20
```

### ios.yml build-and-test job (after macos-15 upgrade)
```yaml
# Source: based on macos-15-Readme.md from actions/runner-images
build-and-test:
  runs-on: macos-15        # was: macos-14
  defaults:
    run:
      working-directory: ios/OpenClawConsole
  steps:
    - uses: actions/checkout@v4
    # No xcode-select step — Xcode 16.4 is default on macos-15
    - name: Resolve Swift packages
      run: |
        xcodebuild -resolvePackageDependencies \
          -scheme OpenClawConsole \
          -destination 'platform=iOS Simulator,name=iPhone 16'
          # Removed: OS=17.2 (not available on macos-15 with Xcode 16.4)
    - name: Build
      run: |
        xcodebuild build \
          -scheme OpenClawConsole \
          -destination 'platform=iOS Simulator,name=iPhone 16' \
          -configuration Debug \
          CODE_SIGNING_ALLOWED=NO \
          | xcpretty
```

### Fastfile setup_ci addition (CI-04 + CI-06)
```ruby
# Source: https://docs.fastlane.tools/best-practices/continuous-integration/github/
default_platform(:ios)

platform :ios do
  before_all do
    setup_ci if ENV['CI']
  end

  desc "Push a new beta build to TestFlight"
  lane :beta do
    build_number = ENV['BUILD_NUMBER'] || ENV['GITHUB_RUN_NUMBER'] || (latest_testflight_build_number + 1).to_s
    increment_build_number(build_number: build_number)
    build_app(scheme: "OpenClawConsole")
    upload_to_testflight
  end

  desc "Setup certificates and profiles via match"
  lane :setup do
    match(type: "appstore")
  end
end
```

### Android versionCode injection (CI-06)
```kotlin
// android/app/build.gradle.kts
// Source: GitHub Actions default env vars docs
defaultConfig {
    applicationId = "com.openclaw.console"
    minSdk = 28
    targetSdk = 35
    versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
    versionName = "1.0"
    // ...
}
```

### Firebase service account auth in workflow (CI-05)
```yaml
# Source: https://firebase.google.com/docs/app-distribution/authenticate-service-account
- name: Write Firebase service account key
  env:
    FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
  run: |
    set -euo pipefail
    CREDENTIALS_FILE="${RUNNER_TEMP}/firebase-sa.json"
    printf '%s' "$FIREBASE_SERVICE_ACCOUNT_JSON" > "$CREDENTIALS_FILE"
    echo "GOOGLE_APPLICATION_CREDENTIALS=$CREDENTIALS_FILE" >> "$GITHUB_ENV"

- name: Distribute to internal Firebase tester(s)
  env:
    FIREBASE_APP_ID: ${{ steps.firebase.outputs.app_id }}
    FIREBASE_INTERNAL_TESTERS: ${{ vars.FIREBASE_INTERNAL_TESTERS }}
  run: |
    set -euo pipefail
    TESTERS="${FIREBASE_INTERNAL_TESTERS:-iganapolsky@gmail.com}"
    firebase appdistribution:distribute \
      android/app/build/outputs/apk/release/app-release.apk \
      --app "$FIREBASE_APP_ID" \
      --testers "$TESTERS" \
      --release-notes "Internal auto-distribution from develop (${GITHUB_SHA})"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `macos-14` + Xcode 15.2 for iOS CI | `macos-15` + Xcode 16.4 (default) | macos-15 GA: April 2025 | iOS 17.2 simulator no longer available; must use iPhone 16 destination |
| `FIREBASE_TOKEN --token` in firebase-tools | `GOOGLE_APPLICATION_CREDENTIALS` service account | Deprecated in firebase-tools ~v13; warning as of 2024 | Will become hard error in future major version |
| AGP 8.6.0 + Kotlin 2.0.21 + Compose BOM 2024.01.00 | AGP 8.7.3 + Kotlin 2.1.21 + Compose BOM 2025.12.00 | AGP 8.7.0 released October 2024 | material3 upgrades from ~1.2 to 1.4.0; compose ui to 1.10.0 |
| Hardcoded `versionCode = 1` | `GITHUB_RUN_NUMBER`-based versionCode | N/A — project never had auto-increment | Enables store submissions without manual version bumps |
| No `setup_ci` in Fastfile | `setup_ci if ENV['CI']` in `before_all` | N/A — missing from initial Fastfile | Prevents build hangs on headless macOS runners |

**Deprecated/outdated in this project:**
- `FIREBASE_TOKEN` secret: deprecated; replace with `FIREBASE_SERVICE_ACCOUNT_JSON`
- `Xcode_15.2.app` and `Xcode_15.4.app` path references: non-existent on macos-15
- `OS=17.2` in xcodebuild `-destination` flags: simulator runtime removed on macos-15 from Jan 12, 2026
- `macos-14` runner tag: still functional but does not have Xcode 16.4

---

## Open Questions

1. **Kotlin 2.1.21 vs 2.1.x — exact patch version to use**
   - What we know: Kotlin 2.1 series is compatible with AGP 8.7.3 and Gradle 8.10.2. Latest stable in 2.1.x at time of research is 2.1.21.
   - What's unclear: Whether 2.1.21 is the latest 2.1.x patch or if a newer patch exists.
   - Recommendation: Check https://kotlinlang.org/docs/releases.html before executing the plan. Use whatever is latest in the 2.1.x series.

2. **Whether `minSdk` in app/build.gradle.kts should be 26 (CLAUDE.md) or 28 (current file)**
   - What we know: CLAUDE.md rules state minSdk = 26 (Android 8.0). Current app/build.gradle.kts has `minSdk = 28`.
   - What's unclear: Whether this was intentional or a drift from the spec.
   - Recommendation: This is out of scope for CI-03 (toolchain version bump only). Flag as a separate issue for the planner to note.

3. **Firebase service account IAM role — exact role name**
   - What we know: The required role is "Firebase App Distribution Admin" per official docs.
   - What's unclear: Whether the existing `GOOGLE_PLAY_JSON_KEY` service account already has this role.
   - Recommendation: When creating the plan task for CI-05, instruct the human operator to create a new service account with specifically the `Firebase App Distribution Admin` role and generate a JSON key.

4. **iOS Xcode project structure — no .xcodeproj found**
   - What we know: The iOS directory only contains a `Package.swift` (SPM package), not a `.xcodeproj`. Fastlane's `build_app(scheme: "OpenClawConsole")` requires an Xcode project or workspace.
   - What's unclear: How `fastlane build_app` currently works without a `.xcodeproj`. The internal-distribution.yml calls `fastlane beta` but the project may not have a proper Xcode project file.
   - Recommendation: CI-04 plan task should verify `.xcodeproj` existence. If missing, the Fastfile changes are necessary but may not unblock the build until the Xcode project file is created. This is a discovery blocker that must be surfaced.

---

## Sources

### Primary (HIGH confidence)
- https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md — Xcode versions on macos-15; default is 16.4; full list includes 16.0, 16.1, 16.2, 16.3, 16.4, 26.x
- https://docs.fastlane.tools/best-practices/continuous-integration/github/ — setup_ci action description; "it creates a temporary keychain. Without this, the build could freeze and never finish."
- https://developer.android.com/build/kotlin-support — Kotlin 2.1 requires minimum AGP 8.6
- https://developer.android.com/build/releases/past-releases/agp-8-7-0-release-notes — AGP 8.7.0 minimum Gradle: 8.9; patch versions: 8.7.0, 8.7.1, 8.7.2, 8.7.3
- https://developer.android.com/develop/ui/compose/bom/bom-mapping — Compose BOM 2025.12.00 maps to: material3:1.4.0, ui:1.10.0, material:1.10.0
- https://firebase.google.com/docs/app-distribution/authenticate-service-account — FIREBASE_TOKEN deprecated; use GOOGLE_APPLICATION_CREDENTIALS with service account JSON

### Secondary (MEDIUM confidence)
- GitHub Actions changelog (April 2025): macos-15 and Windows 2025 images now GA — confirmed via search result title
- GitHub Actions runner-images issue #13392: "Simulator runtimes for Xcode 16.3 and older deprecated on macOS 15 on January 12th, 2026"
- Firebase/firebase-tools discussions #6283: FIREBASE_TOKEN deprecated; GOOGLE_APPLICATION_CREDENTIALS is the replacement path

### Tertiary (LOW confidence — flag for validation)
- Kotlin 2.1.21 as the latest 2.1.x patch: inferred from training data; verify at https://kotlinlang.org/docs/releases.html before executing plan
- AGP 8.7.3 as the latest 8.7.x patch: found in release notes listing; confirm latest at https://developer.android.com/build/releases/past-releases

---

## Metadata

**Confidence breakdown:**
- Standard stack (runners, Xcode versions, AGP/Kotlin requirements): HIGH — verified against official docs and official runner images README
- Architecture patterns (workflow YAML changes, Fastfile patterns, Gradle changes): HIGH — direct inspection of project files + official documentation
- Firebase auth migration pattern: HIGH — official Firebase docs + multiple confirming sources
- Kotlin/AGP exact patch versions: MEDIUM — release notes found but patch number currency not confirmed (see open questions)
- npm lockfile root cause: MEDIUM — inferred from Node version drift pattern; exact reproduction not confirmed since CI logs not available

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable domain — GitHub Actions runner images update monthly; re-verify Xcode default if planning beyond April 2026)
