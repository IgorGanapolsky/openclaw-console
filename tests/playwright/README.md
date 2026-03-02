# Playwright Agentic Testing

This package provides two suites:

- `specs/local` — deterministic repo checks (metadata/screenshot inventory), safe for CI.
- `specs/store` — read-only browser verification for App Store Connect and Play Console using saved auth state.

## Install

```bash
cd tests/playwright
npm ci
npm run install:browsers
```

## Run

```bash
# Quality gate + local deterministic checks
npm run verify

# Save authenticated browser state (manual login once)
TARGET=asc npm run auth:save
TARGET=play npm run auth:save

# Push auth-state JSON into GitHub Actions secrets
npm run auth:sync-secrets

# Authenticated, read-only console checks
ASC_STORAGE_STATE_PATH=.auth/appstore.json PLAY_STORAGE_STATE_PATH=.auth/play.json npm run test:console

# Authenticated, read-only console checks via agent-browser engine
ASC_STORAGE_STATE_PATH=.auth/appstore.json PLAY_STORAGE_STATE_PATH=.auth/play.json npm run test:console:agent-browser
```

## Required Environment (store console tests)

- `ASC_STORAGE_STATE_PATH`: Playwright storage state JSON for an authenticated App Store Connect session.
- `PLAY_STORAGE_STATE_PATH`: Playwright storage state JSON for an authenticated Play Console session.
- Defaults when unset: `.auth/appstore.json` and `.auth/play.json`
- `agent-browser` (optional global install for speed): `npm install -g agent-browser@0.10.0`
  - If not installed globally, the script auto-falls back to `npx agent-browser@0.10.0`.

To wire scheduled CI checks without manual secret editing:

1. Run `TARGET=asc npm run auth:save`.
2. Run `TARGET=play npm run auth:save`.
3. Run `npm run auth:sync-secrets` (requires `gh` CLI auth).

Optional:

- `ASC_VERSION_URL`
- `ASC_EXPECTED_STATE_TEXT` (default: `Prepare for Submission`)
- `ASC_EXPECTED_APP_NAME` (default: `Random Tactical Timer`)
- `PLAY_CONSOLE_URL`
- `PLAY_EXPECTED_APP_NAME` (default: `Random Timer`)
- `PLAY_EXPECTED_BANNER_TEXT`

## Strict Release-Readiness Gate

Set `STRICT_STORE_READINESS=1` when running local checks to enforce:

- At least 3 screenshots in iPhone 6.9"/6.5" class
- At least 3 screenshots in iPad 13" class
- Required iPad captures: `5_ipad_setup.png`, `6_ipad_running.png`, `7_ipad_stopped.png`
- At least 2 unique images per iPhone/iPad class (to prevent placeholder duplicates)

```bash
STRICT_STORE_READINESS=1 npm run test:local
```
