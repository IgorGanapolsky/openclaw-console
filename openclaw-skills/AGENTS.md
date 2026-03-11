# AGENTS.md — OpenClaw Work Console

## Agent-Model Matching Standard

- **Orchestration**: Latest high-reasoning Claude Sonnet class model for planning and coordination.
- **Deep Specialist**: Latest Claude Opus or GPT-4o/5 class model for complex refactoring.
- **Utility Runner**: Latest fast Gemini Flash or Claude Haiku class model for search, analysis, scaffolding.
- **UI/UX Specialist**: Strongest multimodal Gemini Pro class model for layout and visual QA.

## Mandate: Never Claim Readiness Without Verification

**This is the highest-priority rule. Violations are treated as critical failures.**

1. **Never say something is "done", "uploaded", "ready", or "complete" without reading back the actual state.**
2. **Never confuse metadata scaffolding with actual content.** An empty screenshot set is not "screenshots uploaded."
3. **Show evidence, not assertions.** When reporting status, include actual counts, field values, HTTP responses — not summaries or assumptions.
4. **Truthfulness is mandatory.** Never guess, never bluff. Every status claim must include reproducible proof.

## Anti-Lying Mandate (Critical)

1. **Never present intent as fact.** "I will do X" must never be reported as "X is done" until verified.
2. **Never fabricate outcomes, logs, permissions, invites, merges, or CI results.**
3. **If verification is incomplete, say so explicitly** and list what is still unknown.
4. **If an earlier claim was wrong, correct it immediately with concrete evidence.**
5. **Any unverifiable claim is treated as a failure.** Default to "not yet verified" until proof exists.

## Operator Mandate: Env + Secrets Verification Before Blockers

1. Always check `.env` key names first (without exposing values).
2. Always check GitHub Actions secret names (`gh secret list`).
3. If a key is provided by the user, update both `.env` and GitHub secrets immediately.
4. Prove access with a real authenticated test (status code + endpoint + sanitized response).
5. Never claim "no access" until steps 1-4 are completed with evidence.

## North Star

**Daily Active Approvers (DAA)**: unique users who approve at least one agent action per day via the console.

### Business Goal

**Earn $100/day after-tax** from Pro subscriptions ($10-20/month).

### Target Users

1. **Solo dev-founders / indie hackers** running OpenClaw on a VPS for GitHub, deploys, SaaS ops.
2. **DevOps / SREs** using OpenClaw for CI, logs, uptime — needing a mobile console for incidents.
3. **Quant / trading automation builders** running agents monitoring markets, needing approval UIs.
4. **Small AI / data teams** with OpenClaw wired into GitHub + analytics + internal APIs.

## Architecture

```
┌─────────────────┐     WSS/HTTPS     ┌──────────────────────┐
│  iOS App         │◄──────────────────►│                      │
│  (SwiftUI)       │                    │   OpenClaw Gateway   │
└─────────────────┘                    │   (Node.js/TS)       │
                                       │                      │
┌─────────────────┐     WSS/HTTPS     │   Skills:            │
│  Android App     │◄──────────────────►│   - CI Monitor       │
│  (Compose)       │                    │   - Incident Manager │
└─────────────────┘                    │   - Approval Gate    │
                                       │   - Trading Monitor  │
                                       │   - Task Manager     │
                                       └──────────────────────┘
```

Mobile apps are thin clients. All intelligence lives in OpenClaw skills on the user's server.

## Worktree & Branch Protocol

### Mandatory for ALL Agents
1. **Use `isolation: "worktree"` for any code modification.** No exceptions.
2. **Never commit directly to `develop`, `main`, or the user's active branch.**
3. Push worktree branch to origin, then create a PR for review/merge.

### Branch Naming
- Features: `feat/{description}`
- Fixes: `fix/{description}`
- Releases: `release/vX.Y.Z` (only branch type allowed to merge to `main`)
- Hotfixes: `hotfix/vX.Y.Z` (from `main`, merges to both `main` and `develop`)

### Release Flow
1. `develop` → `release/vX.Y.Z` → TestFlight + Google Play → tag on `main` → merge back to `develop`
2. Hotfix: `main` → `hotfix/vX.Y.Z` → stores → tag on `main` → merge to `develop`

## Commands

```bash
# Skills gateway
cd openclaw-skills && npm install && npm run dev    # Gateway on :18789
cd openclaw-skills && npm test                       # 41 tests

# Android
cd android && ./gradlew assembleDebug               # Build debug APK
cd android && ./gradlew testDebugUnitTest            # Unit tests
cd android && ./gradlew lint                         # Lint

# iOS
cd ios/OpenClawConsole && xcodebuild -scheme OpenClawConsole build
cd ios/OpenClawConsole && xcodebuild -scheme OpenClawConsole test
```

## Key Identifiers

- iOS bundle ID: `com.openclaw.console`
- Android package: `com.openclaw.console`
- Apple Team ID: `${APPLE_TEAM_ID}`
- App Store Connect Issuer ID: `${APPSTORE_ISSUER_ID}`
- App Store Connect Key ID: `${APPSTORE_KEY_ID}`
- Gateway default port: `18789`
