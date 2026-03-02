# Architecture Research

**Domain:** Mobile App Deployment — CI/CD pipeline for dual-platform (iOS + Android) native app
**Researched:** 2026-03-02
**Confidence:** HIGH (based on direct inspection of existing codebase and workflows)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SOURCE LAYER                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  android/    │  │  ios/        │  │  openclaw-skills/        │  │
│  │  (Kotlin/    │  │  (Swift/     │  │  (TypeScript Express+WS) │  │
│  │   Compose)   │  │   SwiftUI)   │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼──────────────────────┼────────────────┘
          │                 │                        │
          ▼                 ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  CI VERIFICATION LAYER (GitHub Actions)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  android.yml │  │  ios.yml     │  │  skills.yml              │  │
│  │  - lint      │  │  - swiftlint │  │  - tsc --noEmit          │  │
│  │  - unit test │  │  - unit test │  │  - eslint                │  │
│  │  - debug APK │  │  - sim build │  │  - jest                  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│  ┌──────┴─────────────────┴────────────────────────┴─────────────┐  │
│  │                    ci.yml (omnibus gate)                       │  │
│  │  - architecture lint (Kotlin ban checks)                      │  │
│  │  - architecture lint (Swift ban checks)                       │  │
│  │  - skills-test (integrated check on PR)                       │  │
│  │  - android-build-check + ios-build-check on develop/main      │  │
│  └──────────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────────┘
                              │ (on success, develop branch only)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│               INTERNAL DISTRIBUTION LAYER                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  internal-distribution.yml  (triggered by workflow_run event) │  │
│  │  - gate job: decides if run should proceed                    │  │
│  │    (develop branch + CI green OR manual dispatch)             │  │
│  └───────────────┬──────────────────────────────────────────────┘   │
│                  │                                                   │
│  ┌───────────────▼────────────┐  ┌───────────────────────────────┐  │
│  │  ios-testflight-internal   │  │  android-firebase-internal    │  │
│  │  macos-15 runner           │  │  ubuntu-latest runner         │  │
│  │  - secret validation       │  │  - secret validation          │  │
│  │  - preflight-release.sh    │  │  - preflight-release.sh       │  │
│  │  - setup Ruby/Fastlane     │  │  - setup Java/Gradle          │  │
│  │  - fastlane match (certs)  │  │  - decode keystore            │  │
│  │  - fastlane beta           │  │  - assembleRelease            │  │
│  │  - upload IPA artifact     │  │  - firebase distribute        │  │
│  │                            │  │  - upload APK artifact        │  │
│  └───────────────────────────┘  └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │ (manual dispatch only)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                PRODUCTION RELEASE LAYER                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  native-release.yml  (workflow_dispatch: ios/android/both)    │  │
│  │  - fail-fast on required secrets                              │  │
│  │  - fastlane beta → App Store Connect / TestFlight             │  │
│  │  - gradlew publishReleaseBundle → Google Play                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  release.yml  (version tag + GitHub Release creation)         │  │
│  │  - validate semver format                                     │  │
│  │  - create annotated git tag                                   │  │
│  │  - gh release create with auto-generated notes               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `android.yml` | Platform-specific CI: build debug APK + unit tests + lint | Gradle on ubuntu-latest, uploads test/lint reports as artifacts |
| `ios.yml` | Platform-specific CI: build simulator + unit tests + SwiftLint | xcodebuild on macos-14, xcpretty output |
| `skills.yml` | TypeScript gateway CI: type check + lint + test + build | Node 20 + npm ci on ubuntu-latest |
| `ci.yml` | Cross-platform omnibus: architecture ban checks on all platforms + skills integration gate | Runs on every PR to develop/main |
| `device-tests.yml` | E2E testing: Android emulator (Maestro) + iOS simulator | android-emulator-runner, Maestro CLI |
| `internal-distribution.yml` | Automated distribution gate: routes green develop builds to testers | Triggered by workflow_run; distributes to Firebase + TestFlight |
| `native-release.yml` | Production release: manual-dispatch app store publishing | Fastlane (iOS) + Gradle publishReleaseBundle (Android) |
| `release.yml` | Version management: creates git tags + GitHub Releases | Validates semver, creates annotated tags |
| `android/fastlane/` | Android Fastlane lanes: internal track, production promote, firebase_dev | Fastfile with `internal`, `promote_to_production`, `firebase_dev` lanes |
| `ios/OpenClawConsole/fastlane/` | iOS Fastlane lanes: beta, setup (match), firebase_dev | Fastfile with `beta`, `setup`, `firebase_dev` lanes; Matchfile for cert sync |
| `scripts/preflight-release.sh` | Pre-release checks gate: validates metadata completeness before any release | Bash script invoked by distribution workflows |
| `scripts/setup-secrets.sh` | Developer onboarding: configures required secrets locally | One-time dev setup helper |

---

## Recommended Project Structure

```
openclaw-console/
├── android/                    # Android native app
│   ├── app/                    # Application module
│   │   ├── src/main/           # Production source
│   │   ├── src/test/           # Unit tests
│   │   └── build.gradle.kts    # App-level Gradle config
│   ├── fastlane/               # Android CI/CD automation
│   │   ├── Fastfile            # Lane definitions
│   │   ├── Appfile             # Package/bundle ID
│   │   └── metadata/android/   # Play Store listing content
│   │       └── en-US/          # title.txt, short_description.txt, etc.
│   └── build.gradle.kts        # Project Gradle config
│
├── ios/OpenClawConsole/        # iOS native app
│   ├── OpenClawConsole/        # Swift source
│   ├── OpenClawConsoleTests/   # Unit tests
│   ├── fastlane/               # iOS CI/CD automation
│   │   ├── Fastfile            # Lane definitions
│   │   ├── Appfile             # Bundle ID + Apple ID
│   │   ├── Matchfile           # Cert sync repo config
│   │   └── metadata/en-US/     # App Store listing content
│   └── OpenClawConsole.xcodeproj
│
├── openclaw-skills/            # TypeScript gateway
│   ├── src/
│   │   ├── gateway/            # WebSocket + HTTP server
│   │   ├── skills/             # Individual skill modules
│   │   ├── config/             # Environment configuration
│   │   └── types/              # Shared TypeScript types
│   └── package.json
│
├── scripts/
│   ├── preflight-release.sh    # Pre-release validation gate
│   └── setup-secrets.sh        # Developer onboarding
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # Omnibus gate (runs on every PR)
│       ├── android.yml         # Android-specific CI
│       ├── ios.yml             # iOS-specific CI
│       ├── skills.yml          # Gateway CI
│       ├── device-tests.yml    # E2E (emulator + simulator)
│       ├── internal-distribution.yml  # Auto-distribute on green develop
│       ├── native-release.yml  # Production app store release
│       └── release.yml         # Git tag + GitHub Release
│
└── .planning/                  # Project planning artifacts
```

### Structure Rationale

- **android/ and ios/ are fully independent build units:** Each has its own Fastfile, Gradle/Xcode project, and CI job. They run in parallel. Changes to one never affect the other's build.
- **fastlane/ lives inside each platform directory:** Keeps certificate management, lane definitions, and metadata co-located with the code they deploy. No cross-platform Fastfile coupling.
- **openclaw-skills/ is treated as a standalone package:** Has its own package.json, own CI job (skills.yml), own type/lint/test gates. Never imported directly by native apps.
- **scripts/ contains release infrastructure, not app logic:** preflight-release.sh is invoked by CI workflows to validate store listing metadata before any distribution. This prevents accidental releases with missing metadata.
- **ci.yml acts as the omnibus cross-cutting gate:** Architecture ban checks (no AndroidViewModel, no force casts, no plain HTTP) run here so they apply uniformly regardless of which platform-specific workflow runs.

---

## Architectural Patterns

### Pattern 1: Workflow Chaining via `workflow_run` Trigger

**What:** The `internal-distribution.yml` workflow is triggered by the completion of `iOS CI` and `Android CI` workflows using the `workflow_run` event with type `completed`. It gates on branch = develop and conclusion = success before running.

**When to use:** Whenever a downstream action (distribution) must only happen after an upstream action (CI) passes on a specific branch. Avoids polling or manual triggers.

**Trade-offs:**
- Pro: Fully decoupled. iOS CI and Android CI don't need to know about distribution.
- Pro: Gate logic (branch, conclusion) is centralized in one place.
- Con: `workflow_run` events only trigger when the workflow definition exists on the default branch. PRs from forks won't trigger it.
- Con: If both iOS CI and Android CI succeed, `internal-distribution.yml` fires twice. The `concurrency` group deduplicates this.

**Example (from internal-distribution.yml):**
```yaml
on:
  workflow_run:
    workflows: ["iOS CI", "Android CI"]
    types: [completed]

jobs:
  gate:
    outputs:
      should_run: ${{ steps.decide.outputs.should_run }}
    steps:
      - name: Decide whether to run
        run: |
          if [[ "$WORKFLOW_CONCLUSION" == "success" && "$WORKFLOW_BRANCH" == "develop" ]]; then
            echo "should_run=true" >> "$GITHUB_OUTPUT"
          fi
```

### Pattern 2: Fail-Fast Secret Validation Before Expensive Steps

**What:** Every distribution and release workflow begins by checking all required secrets are non-empty before spending runner minutes on builds. If any secret is missing, the job exits immediately with a clear error message naming the missing secret.

**When to use:** Every workflow that requires credentials (signing keys, API tokens, service account files).

**Trade-offs:**
- Pro: Saves 10-20 minutes of build time when a secret is misconfigured.
- Pro: Error messages are specific — operators know exactly which secret to fix.
- Con: Slightly verbose. Requires listing expected secrets explicitly.

**Example (from internal-distribution.yml):**
```bash
for name in MATCH_GIT_URL MATCH_PASSWORD APPSTORE_PRIVATE_KEY APPSTORE_KEY_ID APPSTORE_ISSUER_ID ADMIN_TOKEN; do
  if [ -z "${!name:-}" ]; then
    echo "❌ Missing required secret: $name"
    exit 1
  fi
done
```

### Pattern 3: Platform-Specific CI + Omnibus Cross-Cutting Gate

**What:** Each platform (android, ios, skills) has its own path-filtered CI workflow that runs only when files in that platform change. Separately, `ci.yml` runs on all PRs and enforces cross-cutting rules (architecture bans, integrated build checks) regardless of which files changed.

**When to use:** Monorepos with multiple independent platforms that share architecture rules.

**Trade-offs:**
- Pro: Fast iteration — changing `ios/` doesn't run Android CI and vice versa.
- Pro: Architecture rules are enforced universally (can't accidentally ship `!!` in Kotlin by only touching a file that doesn't trigger `android.yml`).
- Con: Two separate job sets. Need to understand which gates apply when.

### Pattern 4: Fastlane match for Certificate Management

**What:** iOS code signing certificates and provisioning profiles are stored encrypted in a dedicated git repository. `fastlane match` pulls and installs them on CI runners. The `ios/OpenClawConsole/fastlane/Matchfile` contains the repo URL and team configuration.

**When to use:** Any iOS project that needs reproducible, team-shareable signing certificates without manual Xcode provisioning.

**Trade-offs:**
- Pro: Eliminates "works on my machine" signing issues. Any CI runner can sign.
- Pro: Certificates are version-controlled and recoverable.
- Con: Requires a dedicated private git repo for certificate storage (MATCH_GIT_URL secret).
- Con: MATCH_PASSWORD must be kept secret. If it leaks, certificates must be revoked and regenerated.

---

## Data Flow

### Build Flow: Code to Internal Tester Device

```
Developer pushes to develop
        ↓
GitHub Actions triggers android.yml + ios.yml (path-filtered, parallel)
        ↓
android.yml: assembleDebug + testDebugUnitTest + lintDebug
        ↓
ios.yml: xcodebuild build + test (simulator, no signing)
        ↓
Both workflows report success/failure to GitHub
        ↓
internal-distribution.yml fires via workflow_run event
        ↓
gate job: checks branch == develop AND conclusion == success
        ↓ (if gate passes)
ios-testflight-internal (macos-15):           android-firebase-internal (ubuntu):
  1. Validate secrets                            1. Validate secrets
  2. preflight-release.sh (layer 1)             2. preflight-release.sh (layer 1)
  3. Setup Ruby 3.2 + Fastlane                  3. Setup Java 17 + Gradle
  4. Write ASC API key to filesystem            4. Write google-services.json
  5. fastlane match (pull certs from repo)      5. Decode keystore from base64
  6. fastlane beta:                             6. assembleRelease
     - increment_build_number                   7. Install firebase-tools
     - build_app                                8. firebase appdistribution:distribute
     - upload_to_testflight                     9. Upload APK artifact
  7. Upload IPA artifact                        10. Cleanup /tmp/release.keystore
        ↓                                             ↓
TestFlight internal testers notified        Firebase App Distribution email sent
```

### Production Release Flow: Manual Dispatch

```
Developer triggers native-release.yml via GitHub UI
        ↓
Select: platform (ios/android/both), track, submit_review flag
        ↓
ios-testflight job (macos-15):             android-release job (ubuntu):
  - Fail-fast secret check                   - Setup Java + Gradle
  - fastlane beta (builds + uploads)         - google-services.json injection
                                             - Keystore decode
                                             - gradlew publishReleaseBundle
                                             - (publishes AAB to Play Store)
        ↓
Developer triggers release.yml separately
        ↓
prepare: validate semver format
        ↓
tag: create annotated git tag + push
     gh release create with auto-generated notes
```

### Key Data Flows Summary

1. **Secret injection flow:** GitHub Actions secrets → environment variables in workflow steps → written to ephemeral files (`/tmp/release.keystore`, `~/.appstoreconnect/private_keys/`) → consumed by build tools → cleaned up in `if: always()` steps.

2. **Certificate sync flow (iOS only):** MATCH_GIT_URL secret repo → `fastlane match` → downloaded and installed on CI runner keychain → used by `build_app` → discarded after run ends.

3. **Build artifact flow:** Source code → Gradle/xcodebuild → APK or IPA binary → uploaded as GitHub Actions artifact AND distributed to Firebase/TestFlight → artifact available for download from GitHub UI as backup.

4. **Gate flow (internal distribution):** `workflow_run` event fires → `gate` job evaluates branch + conclusion → outputs `should_run` boolean → downstream jobs check `if: needs.gate.outputs.should_run == 'true'` before executing.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 developer | Current setup is appropriate. Manual dispatch for releases is fine. |
| 2-5 developers | Add branch protection requiring CI passage before merge to develop. Add required reviewers to `production` environment in GitHub. |
| 5-20 developers | Separate release approvals: use GitHub Environments with required reviewers. Consider splitting internal-distribution into separate iOS and Android workflows to allow independent failure. |
| 20+ developers | Consider self-hosted macOS runners to reduce macOS runner costs (macOS runners are 10x more expensive than ubuntu). Consider build caching layer (Gradle remote cache, DerivedData cache). |

### Scaling Priorities

1. **First bottleneck — macOS runner cost/availability:** macos-14/15 runners are significantly more expensive and have limited concurrency. With more developers pushing frequently, queuing becomes a problem. Mitigation: self-hosted runners or tighter path filtering.

2. **Second bottleneck — certificate management at scale:** `fastlane match` works well for small teams but the certificate repo can become a contention point. Mitigation: use match's readonly mode in CI and only allow certificate updates from designated admin machines.

---

## Anti-Patterns

### Anti-Pattern 1: Building Release Artifacts in CI (verification) Workflows

**What people do:** Configure `android.yml` or `ios.yml` to also build signed release artifacts and distribute them.

**Why it's wrong:** Verification CI runs on every PR and push. Building signed artifacts requires production secrets. Exposing production secrets in workflows that run on untrusted PRs (especially from forks) is a security risk. It also slows down every PR with release build overhead.

**Do this instead:** Keep CI workflows building debug/unsigned artifacts only. Use separate distribution workflows (`internal-distribution.yml`, `native-release.yml`) that run on trusted refs (develop, main) and use GitHub Environments to gate secret access.

### Anti-Pattern 2: Hardcoding Tester Emails in Workflow Files

**What people do:** Put Firebase tester email addresses directly in the workflow YAML.

**Why it's wrong:** Tester lists change. Updating them requires workflow changes and code review. Emails in source history leak PII.

**Do this instead:** Use GitHub Actions Variables (`vars.FIREBASE_INTERNAL_TESTERS`) for configuration that changes but isn't secret. The current `internal-distribution.yml` correctly uses `${{ vars.FIREBASE_INTERNAL_TESTERS }}` with a fallback default.

### Anti-Pattern 3: Skipping `preflight-release.sh` for "Quick" Releases

**What people do:** Bypass the preflight script when in a hurry to ship a fix.

**Why it's wrong:** Store metadata (title.txt, description.txt, release_notes.txt) is required by both App Store Connect and Google Play. Submitting without it results in rejection. `preflight-release.sh` exists precisely to catch this before an expensive build-and-upload cycle.

**Do this instead:** Keep preflight as a mandatory step in both `internal-distribution.yml` and `native-release.yml`. Never remove it. The check is fast (seconds) compared to a distribution failure.

### Anti-Pattern 4: Letting `workflow_run`-triggered Workflows Run on Both `develop` and `main`

**What people do:** Forget to add branch filtering in the gate job, so internal distribution fires on every CI run including `main`.

**Why it's wrong:** Main branch CI runs are for verification of merged code, not distribution triggers. Distributing from main bypasses the develop → release flow and creates version confusion.

**Do this instead:** The gate job explicitly checks `WORKFLOW_BRANCH == "develop"`. Manual dispatch (`workflow_dispatch`) is the escape hatch for distributing from other refs.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| TestFlight / App Store Connect | Fastlane `upload_to_testflight` + API key (.p8 file) | Key written to `~/.appstoreconnect/private_keys/` during CI run, never committed |
| Firebase App Distribution | `firebase appdistribution:distribute` CLI command | Authenticates via FIREBASE_TOKEN or GOOGLE_APPLICATION_CREDENTIALS (service account) |
| Google Play | `gradlew publishReleaseBundle` with `GOOGLE_PLAY_JSON_KEY` service account | Publishes AAB (not APK) to specified track |
| Fastlane match cert repo | `git clone` over HTTPS using MATCH_GIT_BASIC_AUTHORIZATION | Private repo stores encrypted P12 certs + provisioning profiles |
| GitHub Actions Environments | `environment: production` on distribution jobs | Controls which secrets are accessible; can require manual approvals |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ci.yml ↔ android.yml / ios.yml | Independent; ci.yml runs its own build checks, does not call other workflows | Duplication is intentional — ci.yml checks are architecture rules, platform workflows check platform correctness |
| internal-distribution.yml ↔ ios.yml + android.yml | `workflow_run` event (asynchronous, event-driven) | Distribution does not share state with CI jobs; it re-checks out code at the verified commit SHA |
| Fastlane ↔ GitHub Actions | Environment variables passed from `env:` blocks into Fastlane lanes | Fastlane reads `ENV["APPSTORE_KEY_ID"]` etc. directly; no JSON config files needed on CI |
| openclaw-skills ↔ native apps | No direct code dependency; communicates at runtime over WebSocket (WSS) + HTTPS per `docs/protocol.md` | Build pipelines are fully separate; skills deploy independently of mobile app releases |

---

## Build Order Implications for Roadmap

The CI/CD deployment architecture has a strict dependency chain that must inform phase sequencing:

```
Phase dependency order:

1. Secrets configured in GitHub (MATCH_GIT_URL, MATCH_PASSWORD, ANDROID_KEYSTORE_BASE64,
   FIREBASE_TOKEN, GOOGLE_SERVICES_JSON, APPSTORE_PRIVATE_KEY, etc.)
        ↓
2. Store metadata files present (fastlane/metadata/en-US/ content for both platforms)
   preflight-release.sh passes
        ↓
3. npm dependencies in openclaw-skills resolve correctly (npm ci succeeds)
   skills-test job in ci.yml passes
        ↓
4. Android debug build succeeds (assembleDebug in CI)
   iOS simulator build succeeds (xcodebuild build, no signing)
        ↓
5. Internal distribution succeeds end-to-end
   Firebase receives Android APK, TestFlight receives iOS IPA
        ↓
6. App installs on real devices
   Biometric approval flow validated on device
        ↓
7. Production release (native-release.yml + release.yml)
```

If step 3 is broken (npm dependency corruption as noted in PROJECT.md), steps 4+ cannot be validated. Fix step 3 before any other work.

---

## Sources

- Direct inspection of `.github/workflows/ci.yml`, `android.yml`, `ios.yml`, `skills.yml`, `internal-distribution.yml`, `native-release.yml`, `release.yml`, `device-tests.yml` — HIGH confidence
- Direct inspection of `android/fastlane/Fastfile`, `ios/OpenClawConsole/fastlane/Fastfile` and `Matchfile` — HIGH confidence
- `docs/protocol.md` for runtime communication boundaries between skills gateway and native apps — HIGH confidence
- `.planning/PROJECT.md` for brownfield context and known blocking issues — HIGH confidence
- GitHub Actions official documentation patterns for `workflow_run` trigger behavior — MEDIUM confidence (consistent with observed workflow structure)

---

*Architecture research for: OpenClaw Console — mobile app deployment pipeline*
*Researched: 2026-03-02*
