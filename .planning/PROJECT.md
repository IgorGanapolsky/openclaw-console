# OpenClaw Console

## What This Is

A native iOS and Android mobile console for monitoring and approving OpenClaw agent actions. Developers and operators can supervise CI/deployments/trading from their phone with biometric verification, escaping the noise of social messaging apps. The core workflow: agents request approval for dangerous actions, users get notifications, tap to review, verify with Face ID/fingerprint, and approve or deny.

## Core Value

Users can install and use the mobile console to approve real OpenClaw agent actions on their phone with biometric verification (Face ID/fingerprint).

## Requirements

### Validated

<!-- Shipped and confirmed working in current codebase. -->

- ✓ Native iOS app architecture (Swift/SwiftUI) — existing
- ✓ Native Android app architecture (Kotlin/Compose) — existing
- ✓ TypeScript skills gateway with Express + WebSocket — existing
- ✓ Basic project structure and build configuration — existing
- ✓ GitHub Actions CI infrastructure — existing
- ✓ Pre-commit hooks and development tooling — existing
- ✓ Project documentation and architecture specs — existing

### Active

<!-- Current scope. Building toward these to unblock testing. -->

- [ ] CI pipeline builds and deploys successfully without failures
- [ ] Skills gateway npm dependencies resolve correctly in CI
- [ ] Android debug builds generate and install on devices/emulators
- [ ] iOS debug builds generate and install on simulators/devices
- [ ] Firebase App Distribution configured for Android testing builds
- [ ] TestFlight configured for iOS testing builds
- [ ] Automated build distribution triggers on successful CI runs
- [ ] You can install and test the app on your actual devices

### Out of Scope

- Production App Store release — defer until testing validates core workflows
- Marketing automation workflows — focus on technical functionality first
- Advanced features (push notifications, real-time sync) — get basic approval flow working first
- Social/sharing features — explicitly anti-goal per vision

## Context

This is a brownfield project with substantial existing code but a broken deployment pipeline. The CI failures (npm dependency corruption) are blocking any testing builds from reaching Firebase/TestFlight, which prevents validation of the core biometric approval workflow. The architecture is sound but the infrastructure needs repair.

Key insight: Without working builds, we can't validate that the biometric approval flow actually works on real devices, which defeats the entire value proposition.

## Constraints

- **Platform Requirements**: iOS 17+, Android API 26+, maintains native performance
- **Security**: All approvals MUST require biometric verification (no bypasses)
- **Timeline**: Fix CI and get testing builds ASAP to validate core workflows
- **Architecture**: Keep existing SwiftUI/Compose + TypeScript gateway architecture
- **Distribution**: Internal testing only (Firebase + TestFlight) until core flows validated

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fix CI before adding features | Can't validate anything without working builds | — Pending |
| Use Firebase + TestFlight for distribution | Standard tools, reliable, support biometric testing | — Pending |
| Focus on deployment pipeline over new features | Existing code has what we need, just can't deploy it | — Pending |

---
*Last updated: 2026-03-02 after project initialization*