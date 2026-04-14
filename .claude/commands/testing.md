---
description: "Run the full test suite — Android unit tests, iOS unit tests, Skills gateway tests, and Maestro E2E."
user-invocable: true
---

# Testing

Run the appropriate test suite based on what changed.

## Steps

1. Detect changed files:
```bash
git diff --name-only HEAD~1
```

2. Run platform-specific tests:

**Android** (if android/ files changed):
```bash
cd android && ./gradlew testDebugUnitTest --no-daemon
```

**iOS** (if ios/ files changed):
```bash
cd ios/OpenClawConsole && xcodebuild -scheme OpenClawConsole \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -configuration Debug test CODE_SIGNING_ALLOWED=NO 2>&1 | tail -30
```

**Skills** (if openclaw-skills/ files changed):
```bash
cd openclaw-skills && npm test
```

3. Report results:
- `pass`: test name, count, time
- `fail`: test name, file:line, error, suggested fix

4. If all pass: `All tests passed (N in Ts)`
