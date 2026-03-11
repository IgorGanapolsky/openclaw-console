# GitHub Copilot Instructions for OpenClaw Console

This repo is a **native mobile app** monorepo:

- Android: Kotlin + Jetpack Compose in `android/`
- iOS: Swift + SwiftUI in `ios/OpenClawConsole/`
- Skills Gateway: TypeScript in `openclaw-skills/`

The app is a **focused work console** for supervising OpenClaw agents from mobile. No social features, no chat noise — just agent monitoring, CI/deploy dashboards, incident alerts, and biometric approvals.

## Non-Negotiables

### Architecture

- Gateway communication via WebSocket (`wss://`)
- All agent interactions go through the OpenClaw gateway
- The mobile app is a **thin client** — no business logic on device
- Biometric auth required for dangerous actions (deploy, restart, shell)

### TDD + Test Gates

- Use TDD: write/adjust **failing tests first**, then implement
- Target **100% coverage** for new/changed business logic
- Default gate: run `make verify` before marking work done
- Add Maestro flows for E2E tests under `.maestro/`

### Task Loop

1. Pick the top unchecked task
2. Write the failing test(s)
3. Implement the minimum to pass
4. Run `make verify`
5. Update task tracking

## Android Guidance (Kotlin/Compose)

- Prefer pure, testable functions for business rules
- Keep Composables thin; push logic into ViewModels
- Use coroutines/Flow; avoid `Handler` and ad-hoc threading
- Package: `com.openclaw.console`

## iOS Guidance (SwiftUI/Swift Concurrency)

- UI is SwiftUI; gateway logic in Services layer
- Prefer `async/await` and `@MainActor` correctness
- Avoid force unwraps in production
- Bundle ID: `com.openclaw.console`

## Skills Gateway (TypeScript)

- Runs on port 18789 by default
- Handles agent routing, skill execution, and webhook delivery
- All skills are defined in `openclaw-skills/src/skills/`

## Safety

- Never commit secrets, API keys, keystores, or private credentials
- Avoid adding new permissions unless the feature truly requires it
- All dangerous agent actions require biometric confirmation
