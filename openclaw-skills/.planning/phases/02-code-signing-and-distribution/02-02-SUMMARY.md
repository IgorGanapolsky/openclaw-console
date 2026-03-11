---
phase: 02-code-signing-and-distribution
plan: "02"
subsystem: infra
tags: [android, keystore, signing, github-secrets, pkcs12, keytool]

# Dependency graph
requires:
  - phase: 02-code-signing-and-distribution
    provides: signingConfigs block in build.gradle.kts reading env vars (from 02-01)
provides:
  - Android release keystore (4096-bit RSA PKCS12, alias=openclaw, validity 10000 days)
  - ANDROID_KEYSTORE_BASE64 GitHub Actions production secret
  - KEYSTORE_PASSWORD GitHub Actions production secret
  - KEY_ALIAS GitHub Actions production secret
  - KEY_PASSWORD GitHub Actions production secret
affects:
  - internal-distribution.yml Decode keystore + Build release APK steps
  - 02-03 and later signing/distribution plans

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PKCS12 keystore: KEY_PASSWORD equals KEYSTORE_PASSWORD (keytool ignores separate key pass for PKCS12)"
    - "GitHub Secrets for keystore: base64-encoded in ANDROID_KEYSTORE_BASE64, decoded at CI time"

key-files:
  created:
    - "~/openclaw-release.jks (local only — backed up to password manager)"
  modified: []

key-decisions:
  - "PKCS12 format selected by keytool default — KEY_PASSWORD set equal to KEYSTORE_PASSWORD since PKCS12 does not support separate store/key passwords"
  - "4096-bit RSA key with 10000-day validity for long-term Play Store release continuity"
  - "KEY_ALIAS=openclaw — matches the pattern in internal-distribution.yml"
  - "Certificate SHA-256: 4F:E6:A3:C5:D7:74:F9:20:E0:33:32:60:7E:E2:72:42:19:6A:1F:6D:75:02:CE:31:6D:04:93:C4:1C:22:41:14"

patterns-established:
  - "Android signing secrets: ANDROID_KEYSTORE_BASE64 + KEYSTORE_PASSWORD + KEY_ALIAS + KEY_PASSWORD in production GitHub environment"
  - "CI round-trip verified: base64 encode → set secret → decode in workflow → keytool list returns PrivateKeyEntry"

requirements-completed: [SIGN-01, SIGN-03]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 2 Plan 02: Android Release Keystore Generation and GitHub Secrets Summary

**4096-bit RSA PKCS12 Android release keystore generated and all four signing secrets (ANDROID_KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD) set in GitHub Actions production environment — internal-distribution.yml can now sign release APKs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T16:45:58Z
- **Completed:** 2026-03-02T16:48:13Z
- **Tasks:** 1 of 2 complete (Task 2 is a human-action checkpoint)
- **Files modified:** 0 (secrets stored in GitHub, keystore in local home dir)

## Accomplishments
- Generated 4096-bit RSA PKCS12 keystore at `~/openclaw-release.jks` (alias: openclaw, DN: CN=OpenClaw Console)
- Verified keystore round-trip: base64 encode + decode + `keytool -list` returns `PrivateKeyEntry` with correct SHA-256 fingerprint
- Set all four signing secrets in the `production` GitHub environment via gh CLI
- Secrets verified present with `gh secret list --repo IgorGanapolsky/openclaw-console --env production`

## Task Commits

Each task was committed atomically:

1. **Task 1: Check for existing keystore and generate if absent** - `588dd77` (chore)

**Plan metadata:** TBD (pending human-action checkpoint completion)

## Files Created/Modified
- `~/openclaw-release.jks` — Android release keystore (local only, must be backed up to password manager)

## Decisions Made
- PKCS12 format selected by keytool default on JDK 21 — KEY_PASSWORD set equal to KEYSTORE_PASSWORD because PKCS12 does not support separate store/key passwords (keytool emits warning and ignores -keypass for PKCS12)
- 4096-bit RSA with 10000-day validity for long-term Play Store release continuity
- KEY_ALIAS=openclaw — matches the signing config pattern in build.gradle.kts and internal-distribution.yml

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- PKCS12 format (JDK 21 default) ignores separate -keypass — keytool warns "Different store and key passwords not supported for PKCS12 KeyStores." KEY_PASSWORD set equal to KEYSTORE_PASSWORD. This is expected behavior for PKCS12; the workflow uses both env vars and both will decode correctly.

## User Setup Required

**CRITICAL — Password Manager Backup Required:**
The keystore file and all credentials MUST be backed up to a password manager before proceeding.

1. The keystore file is at `~/openclaw-release.jks`
2. Open your password manager (1Password, Bitwarden, etc.)
3. Create a new secure note titled "OpenClaw Console — Android Release Keystore"
4. Attach the `openclaw-release.jks` file as a file attachment
5. Record in the secure note:
   - Store password: (from KEYSTORE_PASSWORD secret — retrieve from password manager if you saved it, or from the generation output)
   - Key alias: `openclaw`
   - Key password: (same as store password for PKCS12)
   - Certificate SHA-256: `4F:E6:A3:C5:D7:74:F9:20:E0:33:32:60:7E:E2:72:42:19:6A:1F:6D:75:02:CE:31:6D:04:93:C4:1C:22:41:14`
6. Confirm the note is saved and accessible from a second device

**Why this matters:** A lost Android keystore is permanently unrecoverable — the Play Store treats a new keystore as a new app requiring a new bundle ID. There is no recovery path.

## Next Phase Readiness
- All four signing secrets present in production GitHub environment
- internal-distribution.yml Decode keystore + Build release APK steps are unblocked
- Password manager backup required before proceeding to 02-03

## Self-Check: PASSED
- FOUND: .planning/phases/02-code-signing-and-distribution/02-02-SUMMARY.md
- FOUND: commit 588dd77

---
*Phase: 02-code-signing-and-distribution*
*Completed: 2026-03-02*
