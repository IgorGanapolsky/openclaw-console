# OpenClaw Console Tests

## Structure

- `unit/` — Unit tests for shared logic
- `integration/` — Integration tests for gateway communication

## Platform Tests

- iOS tests: `ios/OpenClawConsole/Tests/`
- Android tests: `android/app/src/test/`

## E2E Tests

Maestro flows: `.maestro/`

## Running

```bash
make verify          # All platforms
make verify-android  # Android only
make verify-ios      # iOS only
```
