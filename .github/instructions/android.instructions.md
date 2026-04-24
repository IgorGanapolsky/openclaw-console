# Android Development Instructions

## Android Agent Workflow
- Use `.agents/skills/android-agent-workflow/SKILL.md` before modifying Android code, launcher icons, Firebase App Distribution, Gradle, Android CI, or Android release metadata.
- Prefer official Android CLI surfaces when available: `android sdk`, `android emulator`, `android run`, `android docs`, and `android skills`.
- Use `android docs` for current Android, Firebase, Google, and Kotlin guidance before changing platform-sensitive APIs.
- Use `android skills` for official workflow instructions such as Navigation, edge-to-edge, AGP migration, XML-to-Compose migration, and R8 analysis.
- Do not paste full Gradle logs in agent responses. Summarize the exact failing task, the relevant error lines, and the next fix.

## Architecture
- MVVM + Clean Architecture
- Kotlin + Jetpack Compose
- Hilt for dependency injection
- Coroutines + Flow for async

## Package Structure
```
com.openclaw.console/
  ui/          # Composables and ViewModels
  data/        # Repositories and data sources
  domain/      # Use cases and models
  gateway/     # WebSocket client for OpenClaw gateway
  service/     # Background services
```

## Build
```bash
cd android && ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest :app:lintDebug --no-daemon
```

## Test
```bash
cd android && ./gradlew testDebugUnitTest
```

## Brand and Release Guardrails
```bash
python3 scripts/sync_app_icons.py --check
./scripts/check-brand-parity.sh
python3 scripts/validate_release_contract.py --platform android
```

- iOS/TestFlight app icon is the canonical visual source. Never hand-edit Android launcher PNGs.
- Use `scripts/sync_app_icons.py` to regenerate Android launcher assets from the iOS marketing icon.
- Use `collectAsStateWithLifecycle`, not raw `collectAsState`, for Flow-backed Compose UI.
- Keep Composables thin and push state/side effects into ViewModels or repositories.
