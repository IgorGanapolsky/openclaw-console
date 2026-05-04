# CI Flake Management

OpenClaw does not quarantine tests silently. A test can only be treated as flaky when it is recorded in `.github/flaky-tests.json` with an owner, issue, reason, skip strategy, and expiry date.

## Policy

- `retry_only` is allowed for emulator, simulator, network, and external-service instability.
- `ci_skip` is reserved for broken tests with an issue and a short expiry.
- Expired quarantines fail CI.
- Unit tests and deterministic build steps should not be retried by default.
- Device and end-to-end logs must be uploaded as artifacts when a retry wrapper is used.

## Workflow

1. Add or update `.github/flaky-tests.json`.
2. Link the GitHub issue that tracks the root cause.
3. Keep `expires_on` short enough to force follow-up.
4. Run `python3 scripts/check_flaky_quarantine.py`.

The goal is the same as Trunk's auto-quarantine value proposition: unblock merges caused by known flakes without hiding real regressions.
