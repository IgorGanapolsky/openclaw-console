---
status: resolved
trigger: "Debug and fix iOS TestFlight certificate matching failure"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - APPSTORE_PRIVATE_KEY environment variable missing in match setup step
test: Applied fix to workflow to include missing environment variable
expecting: iOS build to complete successfully with proper App Store Connect API authentication
next_action: Fix the workflow and test the build

## Symptoms

expected: iOS build should complete certificate matching and proceed to TestFlight upload
actual: Build fails with "git process failed with exit code 128" during "Setup signing certificates and profiles (match)"
errors: git process failed with exit code 128
reproduction: Trigger iOS build in CI workflow
started: Current issue - workflow run 22977790879

## Eliminated

## Evidence

- timestamp: 2026-03-11T19:08:00Z
  checked: GitHub Actions workflow logs for job 66710500922
  found: "Missing username, and running in non-interactive shell" error in fastlane match step
  implication: Fastlane match is trying to authenticate with Apple Developer Portal but no username provided

- timestamp: 2026-03-11T19:08:00Z
  checked: Match step in Fastfile
  found: match() call at line 118 uses api_key parameter but still prompts for username
  implication: Even with App Store Connect API key, match is falling back to username authentication

- timestamp: 2026-03-11T19:09:00Z
  checked: Environment variables in "Setup signing certificates and profiles (match)" step
  found: APPSTORE_PRIVATE_KEY is missing from environment variables in that step
  implication: app_store_api_key_from_env() returns nil because APPSTORE_PRIVATE_KEY is not available

## Resolution

root_cause: APPSTORE_PRIVATE_KEY environment variable is missing from the "Setup signing certificates and profiles (match)" step in internal-distribution.yml workflow, causing app_store_api_key_from_env() to return nil and forcing fastlane match to fall back to username authentication which fails in non-interactive CI environment
fix: Added APPSTORE_PRIVATE_KEY to environment variables in both "Setup signing certificates and profiles (match)" and "Build and upload to TestFlight" steps in internal-distribution.yml and native-release.yml workflows
verification: VERIFIED - Workflow run 22978823908 successfully passed "Setup signing certificates and profiles (match)" step, which was the failing step in the original issue. The fix resolved the "Missing username, and running in non-interactive shell" error by providing the APPSTORE_PRIVATE_KEY environment variable needed for App Store Connect API authentication. Run iOS TestFlight build and verify it completes without authentication errors
files_changed: [".github/workflows/internal-distribution.yml", ".github/workflows/native-release.yml"]