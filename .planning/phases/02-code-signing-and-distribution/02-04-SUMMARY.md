---
phase: 02-code-signing-and-distribution
plan: 04
subsystem: infra
tags: [android, apksigner, firebase, testflight, ci, github-actions, distribution]

# Dependency graph
requires:
  - phase: 02-code-signing-and-distribution
    provides: Android keystore + 4 signing secrets (ANDROID_KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD)
  - phase: 02-code-signing-and-distribution
    provides: iOS match cert repo (IgorGanapolsky/openclaw-certificates) + MATCH_GIT_URL secret
provides:
  - apksigner verify step in internal-distribution.yml — prevents silent distribution of unsigned APKs
  - End-to-end distribution run triggered on develop via workflow_dispatch
  - Distribution run failure evidence identifying two pre-existing blockers (Kotlin build errors + iOS match auth)
affects:
  - future plans: distribution chain is wired correctly but blocked by two pre-existing issues requiring dedicated repair plans

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "apksigner verify step locates binary via Android SDK build-tools path with fallback to PATH — robust against SDK layout changes"
    - "apksigner placed between assembleRelease and Firebase CLI install — ensures unsigned APKs never reach distribute step"

key-files:
  created: []
  modified:
    - .github/workflows/internal-distribution.yml  # Added apksigner verify step between assembleRelease and Install Firebase CLI

key-decisions:
  - "apksigner verify uses find /usr/local/lib/android/sdk/build-tools to locate binary — more reliable than hardcoded path, sorts by version to get latest"
  - "Distribution run conclusion: failure due to two pre-existing blockers (not caused by plan changes): Kotlin UI compilation errors + iOS match auth failure"
  - "iOS match failure: MATCH_GIT_BASIC_AUTHORIZATION token invalid/expired — cert repo clone fails with 'Invalid username or token'"
  - "Android build failure: pre-existing Kotlin errors in AgentListScreen/IncidentListScreen/TaskDetailScreen (isRefreshing, endRefresh, nestedScrollConnection unresolved)"

patterns-established:
  - "APK signature verification gate: always verify before distribute — CI never distributes unsigned APKs silently"

requirements-completed: [SIGN-04, SIGN-05]

# Metrics
duration: 22min
completed: 2026-03-02
---

# Phase 2 Plan 04: End-to-End Distribution Validation Summary

**apksigner verify step added to Android distribution job (commit a3aba2b); distribution run triggered and executed — failed on two pre-existing blockers (Kotlin UI errors + iOS match auth), not plan changes; awaiting human verification of platform builds**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-02T17:59:11Z
- **Completed:** 2026-03-02T18:21:32Z (paused at checkpoint:human-verify)
- **Tasks:** 2 of 3 auto tasks complete (stopped at checkpoint:human-verify)
- **Files modified:** 1 (`.github/workflows/internal-distribution.yml`)

## Accomplishments

- Added `Verify APK is signed` step to `android-firebase-internal` job — inserted between `Build release APK` and `Install Firebase CLI`
- Confirmed all four KEYSTORE_* env vars present in assembleRelease step (KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD)
- Created PR #21 (`feat/02-android-apksigner`), auto-merged to develop at 18:03:20Z (commit `a3aba2b`)
- Triggered `internal-distribution.yml` workflow dispatch on develop (run ID: 22589101833)
- Monitored full 22-minute run lifecycle including 15-minute production environment wait timer
- Identified specific failing steps and root causes for both distribution jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add apksigner verification step to Android distribution job** - `a3aba2b` (feat — merged via PR #21 squash)
2. **Task 2: Trigger distribution run and collect evidence** - no source files changed (CI-only operation)

**Plan metadata:** committed with SUMMARY.md

## Files Created/Modified

- `.github/workflows/internal-distribution.yml` — Added 21-line `Verify APK is signed` step between `Build release APK` and `Install Firebase CLI` in `android-firebase-internal` job

## Decisions Made

- apksigner binary location uses `find /usr/local/lib/android/sdk/build-tools -name "apksigner" -type f | sort -V | tail -1` — gets latest build-tools version, more robust than hardcoded version path
- Fallback to `command -v apksigner` in PATH handles edge cases where SDK path differs
- Distribution run conclusion: `failure` — both jobs failed on pre-existing blockers, not on new changes
- iOS match git clone fails: MATCH_GIT_BASIC_AUTHORIZATION token invalid — "Invalid username or token. Password authentication is not supported for Git operations." (GitHub now requires fine-grained tokens or HTTPS with token auth for private repos)
- Android `compileReleaseKotlin` fails: pre-existing UI compilation errors in AgentListScreen/IncidentListScreen/TaskDetailScreen (the 178-error deferred-items.md backlog)

## Deviations from Plan

None — plan executed exactly as written. The two failures discovered in Task 2 are pre-existing issues logged in deferred-items.md, not deviations introduced by this plan.

## Issues Encountered

**Issue 1 — iOS distribution failure (pre-existing):**
- Job: `ios-testflight-internal`
- Step: `Setup signing certificates and profiles (match)`
- Error: `remote: Invalid username or token. Password authentication is not supported for Git operations. fatal: Authentication failed`
- Root cause: `MATCH_GIT_BASIC_AUTHORIZATION` secret contains a token that GitHub no longer accepts for git operations on private repos (classic PAT may need `repo` scope refresh, or fine-grained PAT required)
- Status: Pre-existing blocker carried over from Plan 02-03 human-action checkpoint — requires user to regenerate MATCH_GIT_BASIC_AUTHORIZATION with a valid PAT

**Issue 2 — Android distribution failure (pre-existing):**
- Job: `android-firebase-internal`
- Step: `Build release APK`
- Error: `Execution failed for task ':app:compileReleaseKotlin'` — Kotlin errors in AgentListScreen (isRefreshing, endRefresh, nestedScrollConnection) and IncidentListScreen
- Root cause: Same 178 pre-existing Kotlin compilation errors logged in `deferred-items.md` since Plan 02-01
- Status: Pre-existing blocker — needs dedicated repair plan for UI layer Kotlin errors

## Distribution Run Evidence

- **Run ID:** 22589101833
- **URL:** https://github.com/IgorGanapolsky/openclaw-console/actions/runs/22589101833
- **Triggered:** 2026-03-02T18:05:32Z via workflow_dispatch on develop
- **Gate job:** success (develop branch, manual_dispatch reason)
- **iOS job:** failure — `fastlane match` git clone authentication error
- **Android job:** failure — `compileReleaseKotlin` Kotlin UI compilation errors
- **Overall conclusion:** failure (pre-existing blockers, not new regressions)

## User Setup Required

Two blockers prevent successful distribution. Both require action:

### Blocker 1: MATCH_GIT_BASIC_AUTHORIZATION token expired/invalid

The current token in production environment is rejected by GitHub. Regenerate it:

1. Go to https://github.com/settings/tokens → Generate new classic token
2. Scopes: `repo` (full repo access)
3. Base64 encode it: `echo -n "x-access-token:YOUR_NEW_PAT" | base64`
4. Update the `MATCH_GIT_BASIC_AUTHORIZATION` secret in GitHub production environment with the base64 output
5. Verify: `gh secret list --repo IgorGanapolsky/openclaw-console --env production | grep MATCH_GIT_BASIC_AUTHORIZATION`

### Blocker 2: Kotlin UI compilation errors (pre-existing)

The 178 Kotlin errors in the UI layer block `assembleRelease`. These errors are in:
- `android/app/src/main/java/com/openclaw/console/ui/screens/agents/AgentListScreen.kt`
- `android/app/src/main/java/com/openclaw/console/ui/screens/incidents/IncidentListScreen.kt`
- `android/app/src/main/java/com/openclaw/console/ui/screens/tasks/TaskDetailScreen.kt`

See `.planning/phases/02-code-signing-and-distribution/deferred-items.md` for full details.
A dedicated repair plan is needed before Android distribution can succeed.

## Next Phase Readiness

- apksigner verify step is in place and correctly wired — will catch unsigned APKs once build succeeds
- Distribution chain is fully wired (gate job, 15-min environment timer, parallel iOS/Android jobs)
- Blocked: iOS distribution requires MATCH_GIT_BASIC_AUTHORIZATION refresh + empty cert repo populated
- Blocked: Android distribution requires UI Kotlin error repair plan
- After both blockers resolved: retry workflow_dispatch to validate full end-to-end distribution

---
*Phase: 02-code-signing-and-distribution*
*Completed: 2026-03-02 (paused at checkpoint:human-verify)*
