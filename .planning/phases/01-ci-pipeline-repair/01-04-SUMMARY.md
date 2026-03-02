---
phase: 01-ci-pipeline-repair
plan: 04
subsystem: infra
tags: [firebase, github-actions, ci-cd, service-account, testflight, fastlane]

requires:
  - phase: 01-ci-pipeline-repair
    plan: 03
    provides: "iOS CI upgrade with macos-15/Xcode 16.4 and Fastfile BUILD_NUMBER support"

provides:
  - "internal-distribution.yml with FIREBASE_SERVICE_ACCOUNT_JSON service account auth (GOOGLE_APPLICATION_CREDENTIALS pattern)"
  - "BUILD_NUMBER injected into iOS TestFlight fastlane beta step via github.run_number"
  - "FIREBASE_TOKEN and GOOGLE_PLAY_JSON_KEY fallback paths fully removed"

affects: [02-signing-and-distribution, release-workflows]

tech-stack:
  added: []
  patterns:
    - "Service account auth via GOOGLE_APPLICATION_CREDENTIALS env var (write JSON to RUNNER_TEMP, export path)"
    - "printf instead of echo for writing JSON secrets to avoid trailing newline corruption"

key-files:
  created: []
  modified:
    - .github/workflows/internal-distribution.yml

key-decisions:
  - "FIREBASE_SERVICE_ACCOUNT_JSON is now the sole Firebase auth path — FIREBASE_TOKEN and GOOGLE_PLAY_JSON_KEY fallback fully removed"
  - "printf '%s' used (not echo) to write service account JSON to avoid trailing newline corrupting the JSON key file"
  - "GOOGLE_APPLICATION_CREDENTIALS set via >> GITHUB_ENV so firebase-tools picks it up automatically in subsequent steps without explicit --token flag"
  - "BUILD_NUMBER: github.run_number injected into ios-testflight-internal fastlane beta step to align with Plan 03 Fastfile BUILD_NUMBER priority logic"

patterns-established:
  - "Service account pattern: write secret to RUNNER_TEMP with printf, export GOOGLE_APPLICATION_CREDENTIALS to GITHUB_ENV"

requirements-completed: [CI-05]

duration: 1min
completed: 2026-03-02
---

# Phase 1 Plan 04: Internal Distribution Summary

**Firebase App Distribution migrated from deprecated FIREBASE_TOKEN to GOOGLE_APPLICATION_CREDENTIALS service account auth, with BUILD_NUMBER injected into iOS TestFlight fastlane beta step**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-02T16:11:00Z
- **Completed:** 2026-03-02T16:11:49Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced FIREBASE_TOKEN + GOOGLE_PLAY_JSON_KEY dual-path auth with a single service account path (FIREBASE_SERVICE_ACCOUNT_JSON secret)
- Added "Write Firebase service account key" step that writes JSON to RUNNER_TEMP using printf (no newline corruption) and exports GOOGLE_APPLICATION_CREDENTIALS to the Actions environment
- Simplified the distribute step: firebase appdistribution:distribute runs without --token flag, relying on GOOGLE_APPLICATION_CREDENTIALS set in prior step
- Injected BUILD_NUMBER: ${{ github.run_number }} into the iOS TestFlight "Build and upload to TestFlight" step so fastlane beta reads it via Plan 03 Fastfile logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Firebase auth to service account and inject BUILD_NUMBER for iOS** - `d17b03d` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `.github/workflows/internal-distribution.yml` - Android Firebase auth migrated to service account; iOS BUILD_NUMBER injected

## Decisions Made

- FIREBASE_SERVICE_ACCOUNT_JSON is the sole Firebase auth path — the old FIREBASE_TOKEN check and the GOOGLE_PLAY_JSON_KEY conditional fallback are completely removed. This eliminates the deprecated --token auth path that firebase-tools will make a hard error in a future major version.
- printf '%s' used instead of echo when writing the service account JSON to RUNNER_TEMP to prevent a trailing newline from corrupting the JSON file (which would cause firebase-tools auth to fail silently).
- BUILD_NUMBER aligned with Plan 03: fastlane beta reads BUILD_NUMBER env var (set in the step's env block) and falls back to GITHUB_RUN_NUMBER, then 1. Injecting BUILD_NUMBER: github.run_number ensures the iOS build number is always the CI run number, enabling deterministic TestFlight builds.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration before this workflow can run green.**

The `android-firebase-internal` job now requires a `FIREBASE_SERVICE_ACCOUNT_JSON` GitHub Actions secret (repository or environment level, under the `production` environment).

Setup steps:
1. Open Google Cloud Console for your Firebase project
2. Navigate to IAM & Admin -> Service Accounts
3. Create a service account with the role `Firebase App Distribution Admin`
4. Under Keys, create a new JSON key and download it
5. Add the entire JSON file contents as the `FIREBASE_SERVICE_ACCOUNT_JSON` secret in GitHub Actions
6. After verifying the new workflow runs green, the old `FIREBASE_TOKEN` secret may be deleted

## Next Phase Readiness

- internal-distribution.yml is now aligned with firebase-tools current auth recommendations
- BUILD_NUMBER flow is complete end-to-end: ios.yml runs CI, triggers internal-distribution.yml, which passes github.run_number to fastlane beta
- Phase 1 (CI Pipeline Repair) is now complete — all 4 plans executed
- Phase 2 (signing and distribution) can begin; blockers to be verified: MATCH_GIT_URL existence and APPSTORE_PRIVATE_KEY scope

---
*Phase: 01-ci-pipeline-repair*
*Completed: 2026-03-02*
