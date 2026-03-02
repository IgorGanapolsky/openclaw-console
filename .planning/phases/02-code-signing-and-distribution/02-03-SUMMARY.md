---
phase: 02-code-signing-and-distribution
plan: 03
subsystem: infra
tags: [fastlane, match, ios, code-signing, github-secrets, certificates]

# Dependency graph
requires:
  - phase: 02-code-signing-and-distribution
    provides: Android keystore + 4 signing secrets (ANDROID_KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD)
provides:
  - Private GitHub repo for fastlane match cert storage (github.com/IgorGanapolsky/openclaw-certificates)
  - MATCH_GIT_URL secret set in production GitHub environment
  - Matchfile confirmed to use ENV["MATCH_GIT_URL"] (no hardcoded URL)
  - Documentation of 6 remaining secrets needing human input (App Store Connect API keys + MATCH_PASSWORD + MATCH_GIT_BASIC_AUTHORIZATION + ADMIN_TOKEN)
affects:
  - 02-04-PLAN (iOS TestFlight distribution requires all 7 secrets complete)
  - internal-distribution.yml (fastlane setup lane uses match cert repo)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fastlane match uses ENV[\"MATCH_GIT_URL\"] — cert repo URL never hardcoded in source"
    - "Certificate storage repo is private GitHub repo, empty until first local `fastlane match appstore` run"

key-files:
  created: []
  modified:
    - ios/OpenClawConsole/fastlane/Matchfile  # Confirmed correct — no change required

key-decisions:
  - "Cert repo created as IgorGanapolsky/openclaw-certificates (private) — empty until human runs fastlane match appstore locally"
  - "MATCH_GIT_URL set to https://github.com/IgorGanapolsky/openclaw-certificates.git in production environment"
  - "Remaining 6 secrets (MATCH_PASSWORD, MATCH_GIT_BASIC_AUTHORIZATION, APPSTORE_KEY_ID, APPSTORE_PRIVATE_KEY, APPSTORE_ISSUER_ID, ADMIN_TOKEN) require human action — cannot be generated programmatically"

patterns-established:
  - "iOS cert repo separation: code repo and cert repo are distinct private repos"
  - "All 7 secrets must be in production environment before CI can run fastlane setup lane"

requirements-completed: [SIGN-02, SIGN-03]

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 2 Plan 03: iOS Match Certificate Repository Summary

**Private iOS cert storage repo created at github.com/IgorGanapolsky/openclaw-certificates and MATCH_GIT_URL secret set; 6 App Store Connect secrets require human action to complete signing chain**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-02T16:49:45Z
- **Completed:** 2026-03-02T16:55:00Z
- **Tasks:** 1 of 1 auto task complete (stopped at checkpoint:human-action)
- **Files modified:** 0 (Matchfile was already correct)

## Accomplishments

- Verified Matchfile already uses `ENV["MATCH_GIT_URL"]` — no source change needed
- Created private cert storage repo `IgorGanapolsky/openclaw-certificates` (private, confirmed via API)
- Set `MATCH_GIT_URL` secret in production GitHub environment pointing to cert repo
- Audited all 7 required secrets — 1 set (MATCH_GIT_URL), 6 missing (require Apple credentials + user decision)
- Confirmed cert repo is empty — `fastlane match appstore` has not been run locally yet

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify or create match cert repo and generate certificates** - `(no source files changed — GitHub infra only)`

**Plan metadata:** committed with SUMMARY.md

_Note: Task 1 was GitHub API operations only. No source files were modified._

## Files Created/Modified

- `ios/OpenClawConsole/fastlane/Matchfile` — Already correct (`git_url(ENV["MATCH_GIT_URL"])`), no changes made

## Decisions Made

- Cert repo created as `IgorGanapolsky/openclaw-certificates` (private) — standard naming convention for match repos
- MATCH_GIT_URL uses HTTPS format (not SSH) for compatibility with GitHub Actions credential injection via MATCH_GIT_BASIC_AUTHORIZATION
- Remaining 6 secrets cannot be automated: APPSTORE_KEY_ID/APPSTORE_PRIVATE_KEY/APPSTORE_ISSUER_ID require App Store Connect dashboard access; MATCH_PASSWORD is a user-chosen passphrase; MATCH_GIT_BASIC_AUTHORIZATION is derived from a GitHub PAT; ADMIN_TOKEN is a GitHub PAT

## Deviations from Plan

None — plan executed exactly as written. Matchfile was already using ENV variable (no update needed, as plan anticipated).

## Issues Encountered

None. All GitHub API calls succeeded. Cert repo was confirmed empty (expected for first-time setup — requires local `fastlane match appstore` run to generate and push encrypted certificates).

## User Setup Required

**External services require manual configuration before this plan is fully complete.**

The following 6 secrets are missing from the production GitHub environment:

| Secret | Source | Instructions |
|--------|--------|-------------|
| `APPSTORE_KEY_ID` | App Store Connect → Integrations → API | Key ID shown on API key creation page |
| `APPSTORE_ISSUER_ID` | App Store Connect → Integrations → API | Issuer ID shown at top of API keys page |
| `APPSTORE_PRIVATE_KEY` | App Store Connect → Integrations → API | Contents of downloaded .p8 file (one-time download) |
| `MATCH_PASSWORD` | User-chosen | Strong passphrase to encrypt certificates in the cert repo |
| `MATCH_GIT_BASIC_AUTHORIZATION` | User's GitHub PAT | `base64("x-access-token:YOUR_PAT")` |
| `ADMIN_TOKEN` | User's GitHub PAT | PAT with `repo` scope |

After setting all 6 secrets, run locally:
```bash
cd ios/OpenClawConsole
MATCH_GIT_URL="https://github.com/IgorGanapolsky/openclaw-certificates.git" \
MATCH_PASSWORD="YOUR_MATCH_PASSWORD" \
fastlane match appstore --app_identifier com.openclaw.console --username iganapolsky@gmail.com
```

Verify with:
```bash
gh secret list --repo IgorGanapolsky/openclaw-console --env production | grep -cE "MATCH_GIT_URL|MATCH_PASSWORD|MATCH_GIT_BASIC_AUTHORIZATION|APPSTORE_KEY_ID|APPSTORE_PRIVATE_KEY|APPSTORE_ISSUER_ID|ADMIN_TOKEN"
# Must output: 7
```

## Next Phase Readiness

- Blocked: 02-04 (TestFlight upload) requires all 7 secrets and populated cert repo
- Ready: MATCH_GIT_URL wired, Matchfile correct, cert repo exists
- After human completes checkpoint: CI can run `fastlane setup` lane in readonly mode

---
*Phase: 02-code-signing-and-distribution*
*Completed: 2026-03-02*
