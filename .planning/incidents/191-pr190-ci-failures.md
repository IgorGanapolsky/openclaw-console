# Incident #191: PR #190 Required Checks Failing

## Summary

PR #190 (`chore: sync develop with main (dependabot updates)`) was closed without merging
on 2026-04-15 due to multiple required CI check failures.

## Root Causes

### 1. Android Build Failure (+ CodeQL java-kotlin)
`android/app/build.gradle.kts` contained unresolved git merge conflict markers at line 67:
```
<<<<<<< HEAD
```
This caused Kotlin DSL script compilation errors, failing both the Android Build Check and
CodeQL Analysis (java-kotlin) jobs.

**Resolution:** Conflict markers were removed; the signing config and RevenueCat dependency
blocks from `develop` were retained.

### 2. Skills Tests + Dependency Audit
`openclaw-skills/package-lock.json` was incomplete after the dependabot sync. The PR deleted
2,895 lines from the lock file, leaving many packages (e.g., `@modelcontextprotocol/sdk`,
`firebase-admin`, `@slack/web-api`, `redis`) missing from the lockfile.

`npm ci` requires exact lockfile–package.json parity and failed with:
```
npm error `npm ci` can only install packages when your package.json and package-lock.json
are in sync.
```

**Resolution:** Lock file was regenerated with `npm install` to match the updated
`package.json` dependency versions.

### 3. iOS Build Failure
Missing Swift types `BridgeListViewModel` and `SubscriptionService` caused compiler errors.
These types were removed/displaced during the conflict resolution in PR #190.

**Resolution:** All required Swift source files are present on the `develop` branch.

## Status

All CI checks pass on the current `develop` branch. Issue #191 is resolved.

## Timeline

- 2026-04-14T21:39Z — Incident detected, issue #191 created by pr-state-machine
- 2026-04-15T19:03Z — PR #190 closed without merging
- 2026-04-15 to 2026-04-16 — Fixes landed via PRs #212, #213, #214
- 2026-04-16 — develop branch verified clean; incident closed
