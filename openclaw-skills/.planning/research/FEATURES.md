# Feature Research

**Domain:** Mobile app deployment pipeline (iOS + Android CI/CD with testing distribution)
**Researched:** 2026-03-02
**Confidence:** HIGH (primary claims verified across official docs, multiple authoritative sources)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = deployment pipeline feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Automated iOS build (Xcode) on merge/push | Every iOS CI pipeline does this; missing it means no CI | MEDIUM | Requires macOS runner; GitHub Actions provides `macos-latest` hosted runners |
| Automated Android build (Gradle) on merge/push | Same expectation for Android; Gradle is the standard | LOW | Ubuntu runners sufficient; `./gradlew assembleDebug` / `assembleRelease` |
| Code signing for iOS (certificates + provisioning profiles) | Unsigned builds can't install on devices; required by Apple | HIGH | Fastlane `match` is the standard: stores certs in encrypted git repo, restores in CI. Requires App Store Connect API key (Issuer ID, Key ID, Key Content) stored in GitHub Secrets |
| Keystore signing for Android (upload key / app signing key) | Unsigned APKs/AABs can't publish to Play Store | MEDIUM | Base64-encode `.jks` into GitHub Secret; inject at build time. Since Aug 2021, Google Play App Signing is default — upload key signs the AAB, Google re-signs for distribution |
| TestFlight upload for iOS testing builds | Standard Apple testing distribution; developers expect this | MEDIUM | Requires `upload_to_testflight` Fastlane action + App Store Connect API credentials |
| Firebase App Distribution upload for Android testing builds | Standard cross-platform testing distribution | LOW | Fastlane `firebase_app_distribution` plugin or Firebase CLI; requires service account JSON |
| Secrets management (GitHub Secrets) | Credentials must never be in source code | LOW | Store as base64-encoded strings; prefix by platform (IOS_, ANDROID_) |
| Build number auto-increment | TestFlight and Play Store require ever-increasing build numbers | LOW | iOS: `increment_build_number` Fastlane action; Android: `versionCode` must always increase. Can derive from `GITHUB_RUN_NUMBER` |
| Unit test execution in CI | Catch regressions before distributing builds | MEDIUM | iOS: `xcodebuild test`; Android: `./gradlew testDebugUnitTest`; fail pipeline on test failure |
| npm/dependency caching | Skills gateway `npm install` must succeed reliably | LOW | GitHub Actions `cache` action with `node_modules` cache key on `package-lock.json` hash |
| Dependency cache for native builds | Slow Gradle/CocoaPods resolution blocks feedback loop | MEDIUM | Android: cache `~/.gradle`; iOS: cache `~/Library/Caches/CocoaPods` if using CocoaPods |
| Per-branch build triggers | Different triggers for develop vs main vs PRs | LOW | GitHub Actions workflow triggers: `push`, `pull_request`, `workflow_dispatch` |
| Tester group management | Control who receives testing builds | LOW | Firebase: email-based groups via `testers` or `testerGroups` param; TestFlight: internal (up to 100, instant) vs external (up to 10,000, 24-48h review) |
| Release notes per build | Testers need context on what changed | LOW | Populate from git log or `CHANGELOG` entry; pass to Firebase/TestFlight via Fastlane |
| Build status notifications | Team needs to know build passed/failed | LOW | Slack webhook or GitHub Actions native status checks; integrate with PR status |

### Differentiators (Competitive Advantage)

Features that set the deployment pipeline apart from a naive setup. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Parallel iOS + Android builds | Cuts total CI time in half; developers don't wait on sequential builds | MEDIUM | Use GitHub Actions matrix strategy or separate jobs with `needs` dependencies; requires both macOS and ubuntu runners |
| Automatic build on PR (with status checks) | Catch broken builds before merge; blocks bad code from reaching develop | LOW | Add `pull_request` trigger with branch filters; require status check on PRs via branch protection rules |
| Semantic versioning from git tags | Consistent version numbers tied to git history; eliminates manual version bumps | MEDIUM | GitVersion or agvtool; derive `versionName`/`MARKETING_VERSION` from git tags, `versionCode`/`CFBundleVersion` from `GITHUB_RUN_NUMBER` |
| Separate lanes per environment (debug/staging/production) | Prevent accidental production release; enforce promotion gates | MEDIUM | Fastlane: `lane :beta` for Firebase/TestFlight, `lane :release` for store submission; different signing profiles per lane |
| Crash reporting integration in testing builds | Know about crashes before testers file bugs; Firebase Crashlytics is the standard pairing with App Distribution | LOW | Add Crashlytics SDK + `GoogleService-Info.plist` / `google-services.json`; crashlytics is auto-configured when using Firebase App Distribution |
| QR code / direct link distribution | Testers can install without email invitation; reduces friction | LOW | Firebase generates install links automatically; TestFlight uses public opt-in links for external testers |
| Reusable composite actions | DRY: checkout, setup, cache steps shared across iOS and Android workflows | MEDIUM | GitHub Actions composite actions in `.github/actions/`; reduces duplication across YAML files |
| Workflow dispatch (manual trigger) | Force a build/deploy on demand without a code push | LOW | `workflow_dispatch` trigger in GitHub Actions YAML; useful for hotfix releases |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Running full E2E/UI test suite on every commit | Confidence that nothing is broken | E2E tests on every commit create a 30-60 min pipeline, instant disengagement; brittle tests cause constant false failures | Run unit tests on every commit; run E2E on merge to develop or nightly. Use Maestro for targeted smoke tests only |
| Self-hosted macOS CI runner | Cost savings vs GitHub's macOS runners | macOS runners are expensive to maintain (Apple licensing, hardware refresh, Xcode upgrades); operational overhead far exceeds savings until 100+ builds/day | Use GitHub Actions `macos-latest` hosted runners; they handle Xcode versioning automatically |
| Custom Docker container for iOS builds | Containerization for reproducibility | Apple does not support macOS in Docker; iOS builds require actual macOS hardware. This is not feasible. | Use GitHub-hosted macOS runners or Codemagic/Bitrise which provide real macOS VMs |
| Embedding signing keys in the repo | "Simpler" setup | Catastrophic security risk; anyone with repo access can sign malicious apps as your organization | Use Fastlane `match` with a separate private repo, or GitHub Secrets for cert storage |
| Monolithic single-job pipeline (build + test + sign + distribute in one job) | Simpler YAML | A single failure at step 10 of 12 re-runs everything from scratch; no parallelism; 45-minute pipelines; developers stop watching | Split into separate jobs: `test`, `build`, `sign`, `distribute`; jobs can run in parallel where independent |
| Building for production App Store on every push | "Ship fast" | Store review takes 1-7 days; uploading every commit pollutes version history; requires unique build numbers for every upload | Build for TestFlight/Firebase on develop; build for store only on tagged releases from main |
| Slack-native delivery notifications with rich embeds | Rich UX for build status | Slack webhook scope creep; teams start building mini-dashboards in Slack; the pipeline becomes a notification system | Use GitHub Actions native PR checks as status; one minimal Slack notification on failure only |

## Feature Dependencies

```
[GitHub Secrets: certificates/keys]
    └──required by──> [iOS Code Signing (Fastlane match)]
                          └──required by──> [TestFlight Upload]
                                               └──enables──> [iOS Tester Distribution]

[GitHub Secrets: keystore]
    └──required by──> [Android APK/AAB Signing]
                          └──required by──> [Firebase App Distribution Upload]
                                               └──enables──> [Android Tester Distribution]

[npm/dependency cache]
    └──required by──> [Skills Gateway build success in CI]
                          └──unblocks──> [Full pipeline green state]

[Unit tests job]
    └──gates──> [Build + Sign job] (don't sign broken builds)

[Build + Sign job]
    └──gates──> [Distribution job] (don't distribute unsigned builds)

[Build number auto-increment]
    └──required by──> [TestFlight Upload] (Apple rejects duplicate build numbers)
    └──required by──> [Play Store Upload] (Google rejects non-increasing versionCodes)

[Separate lanes per environment]
    ──enhances──> [Per-branch build triggers] (develop branch → beta lane, main → release lane)

[Crash reporting SDK]
    ──enhances──> [Firebase App Distribution] (crash data tied to specific distributed builds)

[Parallel iOS + Android builds]
    ──conflicts with──> [Single monolithic pipeline job]
```

### Dependency Notes

- **iOS Code Signing requires GitHub Secrets:** Private keys and certificates cannot be hardcoded; the entire signing chain (cert → provisioning profile → match repo SSH key → App Store Connect API key) flows from secrets.
- **Unit tests gate the build job:** Signing a build that fails unit tests wastes App Store Connect API quota and confuses testers; tests must pass first.
- **Build number auto-increment requires pipeline infrastructure:** Both Apple and Google enforce monotonically increasing build numbers; this must be automated or human error will cause release failures.
- **Parallel builds conflict with monolithic pipelines:** Cannot have both; choose parallel jobs from the start.
- **Skills gateway npm cache is a prerequisite for full CI green state:** The PROJECT.md confirms npm dependency corruption is the current blocker; fixing this unlocks everything else.

## MVP Definition

### Launch With (v1) — Fix CI and Enable Testing Distribution

Minimum viable pipeline — what's needed to get testing builds into devices.

- [ ] Fix npm dependency resolution in CI (lockfile hygiene, cache invalidation) — this is the current blocker per PROJECT.md
- [ ] Android debug build succeeds in CI (Gradle, Ubuntu runner) — unblocks device testing
- [ ] iOS debug build succeeds in CI (Xcode, macOS runner) — unblocks simulator/device testing
- [ ] Android signing configured (keystore in GitHub Secrets, Gradle signs release build) — required for Firebase distribution
- [ ] iOS code signing configured (Fastlane match + App Store Connect API key in GitHub Secrets) — required for TestFlight
- [ ] Firebase App Distribution upload on push to develop (Android) — testers get builds automatically
- [ ] TestFlight upload on push to develop (iOS) — testers get builds automatically
- [ ] Build number auto-increment (derive from `GITHUB_RUN_NUMBER`) — prevents Apple/Google rejections

### Add After Validation (v1.x)

Features to add once testing builds reach devices and core biometric approval flow is validated.

- [ ] Unit test execution in CI with pipeline failure on test failure — add once builds are stable and not failing noisily
- [ ] Automatic PR builds with GitHub status checks — add once develop pipeline is green
- [ ] Release notes automation from git log — add to reduce manual steps per distribution
- [ ] Slack failure notification — add once team is actively monitoring builds
- [ ] Crash reporting (Firebase Crashlytics) in debug/beta builds — add to get crash data from testers

### Future Consideration (v2+)

Features to defer until production release is needed.

- [ ] Production App Store submission lane — defer until testing validates core workflows (explicitly out of scope per PROJECT.md)
- [ ] Semantic versioning from git tags — useful at scale but overkill for current testing phase
- [ ] Parallel iOS + Android builds (matrix strategy) — worthwhile optimization but not a blocker
- [ ] Cloud device farm testing (Firebase Test Lab, AWS Device Farm) — significant cost; defer until test coverage warrants it
- [ ] Phased rollout to production — irrelevant until production release
- [ ] Store metadata management (screenshots, descriptions) — defer until production release

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Fix npm CI dependency resolution | HIGH | LOW | P1 |
| Android debug build in CI | HIGH | LOW | P1 |
| iOS debug build in CI | HIGH | MEDIUM | P1 |
| Android APK/AAB signing (GitHub Secrets) | HIGH | MEDIUM | P1 |
| iOS code signing (Fastlane match) | HIGH | HIGH | P1 |
| Firebase App Distribution upload | HIGH | LOW | P1 |
| TestFlight upload | HIGH | MEDIUM | P1 |
| Build number auto-increment | HIGH | LOW | P1 |
| Unit test execution in CI | HIGH | LOW | P2 |
| PR status checks (auto build on PR) | MEDIUM | LOW | P2 |
| Release notes per build | MEDIUM | LOW | P2 |
| Tester group management | MEDIUM | LOW | P2 |
| Crash reporting integration (Crashlytics) | HIGH | LOW | P2 |
| Slack failure notifications | LOW | LOW | P2 |
| Parallel iOS + Android builds | MEDIUM | MEDIUM | P3 |
| Semantic versioning from git tags | LOW | MEDIUM | P3 |
| Separate lanes per environment | MEDIUM | MEDIUM | P3 |
| Firebase Test Lab / device farm | MEDIUM | HIGH | P3 |
| Production App Store submission lane | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for testing distribution milestone
- P2: Should have, add once builds reach devices
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Firebase App Distribution | TestFlight | Codemagic/Bitrise |
|---------|--------------------------|------------|-------------------|
| Platform support | iOS + Android | iOS only | iOS + Android |
| Tester limit | Unlimited | 100 internal / 10,000 external | N/A (build platform) |
| Review delay | None | 24-48h for external testers | N/A |
| CI/CD integration | CLI + Fastlane plugin + Gradle plugin | Fastlane `upload_to_testflight` | Native, no Fastlane needed |
| Crash reporting | Pairs with Crashlytics | Basic crash logs | N/A |
| Cost | Free (Firebase free tier) | Included in Apple Developer Program ($99/yr) | Paid ($45-299/mo) |
| Our approach | Use for Android; pairs naturally with existing Firebase ecosystem | Use for iOS; required for iOS device testing | Skip — GitHub Actions is sufficient and free |

## Sources

- [CircleCI: CI/CD requirements for mobile applications](https://circleci.com/blog/ci-cd-requirements-for-mobile/) — MEDIUM confidence (verified with multiple sources)
- [Refraction Dev: CI/CD Pipelines Best Practices for Mobile Apps](https://refraction.dev/blog/cicd-pipelines-mobile-apps-best-practices) — MEDIUM confidence
- [Runway: How to set up a CI/CD pipeline for iOS using fastlane and GitHub Actions](https://www.runway.team/blog/how-to-set-up-a-ci-cd-pipeline-for-your-ios-app-fastlane-github-actions) — MEDIUM confidence
- [Bright Inventions: iOS TestFlight GitHub Actions Fastlane Match 2025](https://brightinventions.pl/blog/ios-testflight-github-actions-fastlane-match/) — MEDIUM confidence
- [Fastlane match official docs](https://docs.fastlane.tools/actions/match/) — HIGH confidence (official docs)
- [TestApp.io: Best Mobile App Distribution Platforms 2026](https://blog.testapp.io/best-mobile-app-distribution-platforms/) — MEDIUM confidence
- [Firebase App Distribution vs TestFlight — Brightec](https://www.brightec.co.uk/blog/firebase-app-distribution-vs-testflight) — MEDIUM confidence
- [GitHub Marketplace: Prepare Signing action](https://github.com/marketplace/actions/prepare-signing) — HIGH confidence (official)
- [EM360Tech: CI/CD Anti-Patterns](https://em360tech.com/tech-articles/cicd-anti-patterns-whats-slowing-down-your-pipeline) — MEDIUM confidence
- [DZone: Continuous Delivery Patterns and Anti-Patterns](https://dzone.com/refcardz/continuous-delivery-patterns) — MEDIUM confidence

---
*Feature research for: Mobile app deployment pipeline (iOS + Android CI/CD + testing distribution)*
*Researched: 2026-03-02*
