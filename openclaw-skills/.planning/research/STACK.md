# Stack Research

**Domain:** Mobile app CI/CD deployment pipeline (iOS + Android)
**Researched:** 2026-03-02
**Confidence:** HIGH (verified against official docs and runner-images repository)

---

## Context: Existing System State

This is a brownfield project. The CI/CD scaffolding already exists but has known failure modes:

- `npm ci` fails in `skills-test` job due to `package-lock.json` version mismatch
- `ios.yml` pins `macos-14` + `Xcode_15.2.app` — both outdated (macos-15 is now GA with Xcode 16.4 default)
- Android `build.gradle.kts` uses Kotlin `1.9.20` + AGP `8.2.0` — both stale vs 2025 releases
- Compose BOM `2024.01.00` is 14+ months behind stable
- iOS Fastfile missing `setup_ci` call — causes keychain freeze in CI
- `internal-distribution.yml` listens for `["iOS CI", "Android CI"]` workflow names but the actual workflows in `ios.yml` and `android.yml` are named `"iOS CI"` and `"Android CI"` respectively — verify exact name match
- `FIREBASE_TOKEN` is the legacy auth method; Google now recommends Workload Identity Federation or a service account via `GOOGLE_APPLICATION_CREDENTIALS`

---

## Recommended Stack

### CI Platform

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| GitHub Actions | N/A (SaaS) | CI/CD orchestration | Already in use, free for public repos, native macOS runners for Xcode |
| `macos-15` runner | GA (April 2025) | iOS builds requiring Xcode | Has Xcode 16.4 default, Swift 6 support, CocoaPods 1.16.2 pre-installed |
| `ubuntu-latest` runner | N/A | Android builds, Node.js skills | Faster and cheaper than macOS; Android builds do not need macOS |

### iOS Build and Signing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Fastlane | 2.230.0+ | Build automation, signing, upload | Industry standard; match handles cert sync; gym/pilot handle build+upload |
| Fastlane `match` | bundled with Fastlane | Code signing via git-based cert repo | Eliminates manual provisioning profile management; reproducible in CI |
| `ruby/setup-ruby@v1` | v1 (latest) | Ruby environment for Fastlane | `bundler-cache: true` caches gems natively, avoids manual cache steps |
| Ruby | 3.3 | Runtime for Fastlane | Version on `macos-15` runner is 3.3.10; pin to this to avoid drift |
| `setup_ci` (Fastlane action) | bundled | Creates temporary keychain | MANDATORY in CI — without it, `build_app` hangs waiting for keychain unlock |
| xcbeautify | latest | xcodebuild output formatter | Replaces xcpretty as the recommended formatter since fastlane 2.201.0 |
| App Store Connect API key (P8) | N/A | Auth to upload TestFlight builds | Preferred over Apple ID + 2FA; stored as `APPSTORE_PRIVATE_KEY` secret |

### Android Build and Signing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `actions/setup-java@v5` | v5 | JDK setup | Temurin distribution is pre-cached on GitHub runners; fastest setup |
| Temurin JDK 17 | 17 | Java runtime for Gradle | AGP requires JDK 17; Temurin is recommended by Google over AdoptOpenJDK |
| `gradle/actions/setup-gradle@v5` | v5 | Gradle setup and caching | Official Gradle action; provides build scan integration and dependency caching |
| Android Gradle Plugin (AGP) | 8.7.x | Android build system | 8.2.0 in current code is stale; 8.7.x is stable as of late 2025 |
| Kotlin | 2.1.x | Language + Compose compiler | 1.9.20 in current code is stale; Kotlin 2.x unifies Compose compiler versioning |
| Compose BOM | 2025.12.00 or 2026.02.01 | Compose version alignment | Current code uses `2024.01.00` — 14+ months behind; BOM manages all Compose versions atomically |

### Distribution

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TestFlight | N/A (Apple service) | iOS internal testing distribution | Only official Apple beta distribution; deep OS integration for testers |
| Firebase App Distribution | firebase-tools 14.x | Android internal testing distribution | Best option for Android pre-Play Store; tester email invites, CI-friendly CLI |
| `firebase-tools` CLI | 14.23.0 | Firebase App Distribution uploads | `npm install --global firebase-tools` in workflow; use `--token` or GOOGLE_APPLICATION_CREDENTIALS |

### Node.js / Skills Gateway

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `actions/setup-node@v6` | v6 (v6.2.0) | Node.js environment | Current stable; auto-detects npm from `package.json` |
| Node.js | 20 LTS | Skills gateway runtime | LTS lifecycle through April 2026; current `package.json` `engines` specifies `>=18` |
| `npm ci` | npm bundled with Node 20 | Deterministic installs | Must have a committed `package-lock.json` that matches `package.json` exactly |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fastlane-plugin-firebase_app_distribution` | latest gem | Firebase upload from Fastlane lane | When using `fastlane firebase_dev` lane instead of CLI directly |
| `actions/upload-artifact@v4` | v4 | Store build artifacts (IPA, APK) | Always — needed for debugging distribution failures |
| `actions/checkout@v4` | v4 | Code checkout | All jobs |
| SwiftLint | latest via Homebrew or `cirruslabs/swiftlint-action@v1` | Swift style enforcement | iOS lint job; use dedicated action instead of `brew install swiftlint` to avoid slow Homebrew install |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `xcbeautify` | xcodebuild output formatter | Install via `brew install xcbeautify` or as Swift package; Fastlane 2.201.0+ uses it automatically if installed |
| Fastlane Match | Centralized cert/profile management | Requires a private git repo for cert storage; `MATCH_GIT_URL` + `MATCH_PASSWORD` secrets |
| Maestro | Mobile E2E UI testing | YAML-based flows; iOS simulator support only (not real device); Android supports real devices |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| GitHub Actions | Bitrise / Codemagic | When budget allows dedicated mobile CI; Bitrise has faster macOS runners and better Xcode switching. For a solo/small team on GitHub, native Actions is sufficient. |
| Fastlane match (git storage) | Fastlane match (Google Cloud / S3) | If the team already uses GCP/AWS infra and prefers not to maintain a cert repo on GitHub. Git storage is simpler for a solo developer. |
| TestFlight | Firebase App Distribution for iOS | Firebase iOS requires Google account for testers + a device profile install step. TestFlight is strictly better UX for iOS testers. |
| Firebase App Distribution | Google Play Internal Testing | Play Internal Testing requires the app to be published to the Play Store first (even internal track needs an initial upload). Firebase is better for pre-launch Android testing. |
| `ruby/setup-ruby@v1` (bundler-cache) | Manually caching gems with `actions/cache` | `ruby/setup-ruby@v1` handles cache key invalidation, bundler version, and lockfile correctly. Manual caching is error-prone and fragile. |
| `gradle/actions/setup-gradle@v5` | `actions/cache` for Gradle | `gradle/actions` handles Gradle wrapper validation, dependency caching, and build scan integration automatically. |
| GOOGLE_APPLICATION_CREDENTIALS service account | `FIREBASE_TOKEN` (legacy) | `FIREBASE_TOKEN` (`firebase login:ci`) is deprecated by Google. New projects should use service account JSON or Workload Identity Federation. WIF is not supported by Firebase Admin SDK; use service account JSON. |
| AGP 8.7.x + Kotlin 2.1.x | AGP 8.2.0 + Kotlin 1.9.20 (current in codebase) | Stay on the current versions only if there is a known incompatibility with a dependency. No reason to stay on stale versions here. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `xcpretty` | No longer the recommended formatter; does not support new build system output or parallel testing; effectively unmaintained | `xcbeautify` (actively maintained, Swift-native, supports Xcode parallel test output) |
| `macos-14` runner for new iOS builds | Older image; Xcode 15.x, no Xcode 16.x; slower hardware generation | `macos-15` runner (Xcode 16.4 default, Swift 6 native) |
| Apple ID + password auth in Fastlane | 2FA makes it unreliable in CI; Apple can block automated logins | App Store Connect API key (P8 file stored as GitHub secret) |
| `FIREBASE_TOKEN` (`firebase login:ci`) | Google has deprecated this auth pattern; may stop working | Service account JSON in `GOOGLE_APPLICATION_CREDENTIALS` env var |
| `npm install` in CI instead of `npm ci` | Non-deterministic; can upgrade packages silently | `npm ci` with a committed, valid `package-lock.json` |
| Hardcoded keystore in the repo | Security risk; exposes signing key | Base64-encoded keystore as `ANDROID_KEYSTORE_BASE64` GitHub secret, decoded at build time then deleted |
| `Xcode_15.2.app` hardcoded path | Breaks when runner image changes; path differs on macos-15 | `sudo xcode-select -s /Applications/Xcode_16.4.app` on macos-15, or use `maximbaz/setup-xcode` action |

---

## Stack Patterns by Variant

**If the `npm ci` step fails with "package.json and package-lock.json are out of sync":**
- Run `npm install` locally in the `openclaw-skills/` directory and commit the updated `package-lock.json`
- The lockfile was generated with an older npm version and fails validation with npm 8.6.0+ strict mode
- Do NOT add `--legacy-peer-deps` as a workaround — fix the lockfile root cause

**If Fastlane match fails with keychain errors in CI:**
- Add `setup_ci if ENV['CI']` at the top of every lane that calls `match` or `build_app`
- The current iOS Fastfile is missing this call — it will hang on macos-15

**If iOS build fails with code signing errors:**
- Verify `APPLE_TEAM_ID` and `ITC_TEAM_ID` secrets are set; the Appfile reads both from env vars
- Ensure match repo is accessible: `MATCH_GIT_URL` must point to a private repo the `ADMIN_TOKEN` can read

**If Android release build fails to sign:**
- `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` must all be set as GitHub secrets
- The keystore is decoded from `ANDROID_KEYSTORE_BASE64` at build time; verify the base64 encoding with `base64 -d` locally

**If Firebase App Distribution upload fails auth:**
- Set `GOOGLE_PLAY_JSON_KEY` (service account JSON) as secret and let `GOOGLE_APPLICATION_CREDENTIALS` env var pick it up
- This is the recommended path over the deprecated `FIREBASE_TOKEN`

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| AGP 8.7.x | Kotlin 2.1.x | AGP 8.7 requires Kotlin 2.0+; current codebase uses Kotlin 1.9.20 with AGP 8.2.0 — both must be upgraded together |
| AGP 8.7.x | JDK 17 | Minimum JDK 17; JDK 21 is also supported |
| Compose BOM 2025.12.00 | AGP 8.5+ | Use BOM to avoid manually managing individual Compose library versions |
| Kotlin 2.1.x + Compose | No separate `kotlinCompilerExtensionVersion` needed | Kotlin 2.0+ bundles the Compose compiler; remove `composeOptions { kotlinCompilerExtensionVersion = ... }` when upgrading |
| Fastlane 2.230.0 | Ruby 3.3 | Ruby 3.3.10 is pre-installed on macos-15; pin `ruby-version: "3.3"` in `ruby/setup-ruby@v1` |
| `xcbeautify` | Fastlane 2.201.0+ | Auto-detected if installed; no Fastfile changes needed |
| firebase-tools 14.x | Node.js 18+ | Install with `npm install --global firebase-tools`; skip the version pin, use `@latest` |

---

## Installation

```bash
# iOS: install via Bundler (run in ios/OpenClawConsole/)
bundle install   # installs fastlane + fastlane-plugin-firebase_app_distribution

# iOS: xcbeautify (via Homebrew, local only — pre-installed on macos-15 runner)
brew install xcbeautify

# Android: no npm install needed — Gradle handles all dependencies via wrapper

# Skills gateway (run in openclaw-skills/)
npm ci           # requires package-lock.json to be in sync with package.json

# Firebase CLI (in CI workflow step, not local)
npm install --global firebase-tools
```

---

## Sources

- `https://docs.fastlane.tools/best-practices/continuous-integration/github/` — setup_ci requirement, Fastlane GitHub Actions setup (MEDIUM confidence — matches official Fastlane docs)
- `https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md` — Xcode 16.4 default on macos-15, Ruby 3.3.10, Fastlane 2.232.1, CocoaPods 1.16.2 pre-installed (HIGH confidence — official runner image manifest)
- `https://github.com/ruby/setup-ruby` — `bundler-cache: true` recommended, auto-handles gem caching (HIGH confidence — official action)
- `https://github.com/gradle/actions` — `setup-gradle@v5` recommended for Android (HIGH confidence — official Gradle action)
- `https://firebase.google.com/docs/app-distribution/android/distribute-cli` — service account preferred over FIREBASE_TOKEN; firebase-tools 14.23.0 current (MEDIUM confidence — official Firebase docs)
- `https://cpisciotta.github.io/xcbeautify/` — xcbeautify recommended over xcpretty since Fastlane 2.201.0 (HIGH confidence — Fastlane docs confirm)
- `https://developer.android.com/develop/ui/compose/bom` — Compose BOM 2026.02.01 latest stable (HIGH confidence — official Android docs)
- WebSearch: Kotlin 2.1.x stable, AGP 8.7.x stable, firebase-tools 14.23.0, Fastlane 2.230.0 (MEDIUM confidence — multiple corroborating search results)
- `https://github.com/actions/setup-node/releases` — setup-node@v6.2.0 current (HIGH confidence — GitHub releases)

---

*Stack research for: Mobile CI/CD deployment pipeline — OpenClaw Console (iOS + Android)*
*Researched: 2026-03-02*
