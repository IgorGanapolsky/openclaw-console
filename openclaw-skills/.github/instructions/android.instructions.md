# Android Development Instructions

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
cd android && ./gradlew assembleDebug
```

## Test
```bash
cd android && ./gradlew testDebugUnitTest
```
