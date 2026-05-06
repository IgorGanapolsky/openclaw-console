# Mobile Test Coverage Map

OpenClaw release readiness requires coverage for every critical Mobile Console flow on both native platforms.

The enforceable source of truth is `docs/testing/mobile-critical-flow-coverage.json`. CI runs `scripts/check_mobile_test_coverage.py` to verify that every critical flow maps to:

- Android unit or instrumentation test coverage.
- Android Maestro E2E coverage.
- iOS unit test coverage.
- iOS Maestro E2E coverage.

## Critical Flows

- App launches without crash.
- Gateway can be paired by QR code or pairing link.
- Gateway tokens are stored in platform secure storage.
- Gateway health requests include bearer auth and parse responses.
- Approval requests arrive through the Gateway WebSocket stream.
- Dangerous approval decisions require biometric verification.

## Operating Rule

Any feature that changes Gateway Connection, Approval Request, biometric, WebSocket, storage, or launch behavior must update the coverage map in the same PR. A mapped file must exist in the repository; placeholders are rejected by CI.
