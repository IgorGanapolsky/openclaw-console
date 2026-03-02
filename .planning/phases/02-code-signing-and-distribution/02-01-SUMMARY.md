---
phase: 02-code-signing-and-distribution
plan: 01
subsystem: infra
tags: [android, gradle, signing, mipmap, launcher-icons, adaptive-icons]

# Dependency graph
requires:
  - phase: 01-ci-pipeline-repair
    provides: Android toolchain at AGP 8.7.3 / Kotlin 2.1.21 that compiles resources

provides:
  - Android PNG launcher icons at all 5 densities (mdpi through xxxhdpi)
  - Adaptive icon XML in mipmap-anydpi-v26 (API 26+)
  - signingConfigs.release block reading KEYSTORE_PATH/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD
  - release buildType wired to signingConfigs.release when keystore env vars are present

affects: [02-02, 02-04, internal-distribution.yml android signing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Android signing via System.getenv() — no credentials in source, fails gracefully when env vars absent"
    - "Adaptive icons: mipmap-anydpi-v26/ic_launcher.xml for API 26+, PNG fallbacks for legacy"

key-files:
  created:
    - android/app/src/main/res/mipmap-mdpi/ic_launcher.png
    - android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
    - android/app/src/main/res/mipmap-hdpi/ic_launcher.png
    - android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
    - android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
    - android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
    - android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
    - android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
    - android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
    - android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
  modified:
    - android/app/build.gradle.kts

key-decisions:
  - "02-01: signingConfigs.release uses System.getenv() for all four keystore params — block is inert when env vars absent, no need for conditional block around signingConfigs creation"
  - "02-01: PNG placeholders (dark navy #1A1A2E fill) for pre-API-26 launcher icon fallback — visual identity update deferred until post-beta"
  - "02-01: assembleDebug BUILD FAILED due to 178 pre-existing Kotlin compilation errors in UI layer (NavGraph, screen files) — NOT caused by plan tasks; AAPT resource linking and Gradle config parse successfully"

patterns-established:
  - "Signing pattern: signingConfigs.release + conditional storeFile check in release buildType"
  - "Icon pattern: adaptive-icon XML (api 26+) + PNG fallback for legacy densities"

requirements-completed: [SIGN-01, SIGN-05]

# Metrics
duration: 45min
completed: 2026-03-02
---

# Phase 2 Plan 01: Android Launcher Icons + signingConfigs Summary

**Android release signing infrastructure: signingConfigs block reading env vars, PNG launcher icons at all 5 densities, adaptive icon XML for API 26+**

## Performance

- **Duration:** 45 min
- **Started:** 2026-03-02T16:20:00Z
- **Completed:** 2026-03-02T17:05:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- PNG launcher icons created at mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi (48–192px) eliminating the AAPT resource linking error that blocked assembleRelease
- Adaptive icon XML at mipmap-anydpi-v26 using foreground vector + background color (API 26+ devices)
- signingConfigs.release block added to build.gradle.kts reading KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD via System.getenv()
- release buildType wired to signingConfigs.release with null-safe storeFile check — unsigned release builds still work when env vars absent

## Task Commits

Each task was committed atomically:

1. **Task 1: Android PNG launcher icons at all densities** - `163bb4c` (feat)
2. **Task 2: signingConfigs block to build.gradle.kts** - `9be42a7` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` — 48x48 dark navy placeholder
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` — 48x48 dark navy placeholder
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` — 72x72 dark navy placeholder
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` — 72x72 dark navy placeholder
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` — 96x96 dark navy placeholder
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` — 96x96 dark navy placeholder
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` — 144x144 dark navy placeholder
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` — 144x144 dark navy placeholder
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` — 192x192 dark navy placeholder
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` — 192x192 dark navy placeholder
- `android/app/build.gradle.kts` — signingConfigs.release block + release buildType signing wiring

## Decisions Made
- PNG placeholders use dark navy #1A1A2E fill — simple solid color bypasses external tools, matches console aesthetic, easy to replace post-beta
- signingConfigs block always created (not conditional) — if/null check is inside the block, so Gradle config always parses cleanly regardless of env var presence
- Conditional `storeFile` check before `signingConfig = signingConfigRelease` assignment — prevents Gradle warning when building without keystore (local debug builds)
- Used `findByName("release")` instead of `getByName("release")` to avoid NPE during local builds where signingConfigs.release.storeFile may be null

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kotlin FIR compiler crash (internal compiler error) resolved by serialization downgrade**
- **Found during:** Task 2 verification (`./gradlew assembleDebug`)
- **Issue:** `FirIncompatibleClassExpressionChecker` crashed with `source must not be null` — kotlinx-serialization-json:1.10.0 compiled against Kotlin 2.3.0 stdlib but compiler is 2.1.21 (max metadata 2.2.0)
- **Fix:** Downgraded `kotlinx-serialization-json` to `1.8.1` (last version built for Kotlin 2.1.x) — already committed by automation in `526e0b2`
- **Files modified:** `android/app/build.gradle.kts`
- **Verification:** FIR crash gone; build proceeds to Kotlin compilation phase
- **Committed in:** `526e0b2` (pre-existing automation fix)

**2. [Out of scope] Pre-existing Kotlin compilation errors (178 errors in 10 UI files)**
- **Found during:** Task 2 verification (`./gradlew assembleDebug`)
- **Issue:** `collectAsStateWithLifecycle` missing import in NavGraph.kt; stale data model field references in screen files (`agents`, `incidents`, `name`, `workspace` not found)
- **Action:** Documented in `deferred-items.md` — NOT fixed (out of scope per deviation rules: pre-existing errors not caused by current task changes)
- **Confirmed pre-existing:** git stash test showed same errors before any Task 2 changes
- **Workaround:** Verified AAPT resource linking passes (`./gradlew processDebugResources` = BUILD SUCCESSFUL); Gradle signingConfigs parses correctly (`./gradlew help` = BUILD SUCCESSFUL)

---

**Total deviations:** 1 auto-fixed (serialization compatibility), 1 deferred (pre-existing code compilation errors)
**Impact on plan:** Serialization fix unblocked FIR crash. Pre-existing compilation errors prevent `assembleDebug` success but do not affect the plan's actual deliverables (icon resources and signing config).

## Issues Encountered
- Pre-commit hook automation made competing changes to `ic_launcher.xml` files and reset branch to `origin/main`, causing a git history divergence. Recovered plan files from reflog. Icon structure from automation commit (`13dcbde`) preserved; only PNG files needed to be added.
- `kotlinx-serialization-json:1.10.0` requires Kotlin 2.3.0 stdlib which conflicts with Kotlin compiler 2.1.21 — triggers FIR checker crash. Fixed by downgrading to 1.8.1.

## User Setup Required
None - no external service configuration required for this plan. (Keystore secrets configuration is in 02-02-PLAN.md)

## Next Phase Readiness
- 02-02: Android keystore backup + GitHub Secrets — icon resources and signingConfigs block are now in place, ready for keystore generation and secret injection
- 02-04: End-to-end signing verification — signingConfigs.release will activate when KEYSTORE_PATH/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD are set
- Blocker for full `assembleDebug` success: 178 pre-existing Kotlin compilation errors in UI layer need a dedicated repair plan (logged in deferred-items.md)

---
*Phase: 02-code-signing-and-distribution*
*Completed: 2026-03-02*
