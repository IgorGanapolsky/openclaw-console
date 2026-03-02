# Contributing to OpenClaw Work Console

Thanks for your interest in contributing. Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch from `develop`
4. Make your changes
5. Submit a pull request targeting `develop`

## Development Setup

### Skills Gateway (TypeScript)
```bash
cd openclaw-skills
npm install
npm run dev
# Gateway starts on http://localhost:18789
```

### Android
```bash
cd android
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

### iOS
```bash
cd ios/OpenClawConsole
open OpenClawConsole.xcodeproj
# Build with Cmd+R in Xcode, or:
xcodebuild build -scheme OpenClawConsole -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Branch Model

- `main` — production. Only receives merges from `develop`, `release/*`, or `hotfix/*`.
- `develop` — integration branch. All feature work merges here first.
- `feat/*`, `fix/*`, `chore/*` — short-lived branches off `develop`.

## Guidelines

- **Kotlin**: MVVM + Compose + Repository pattern. No `!!` without justification.
- **Swift**: SwiftUI + @Observable. No force-unwraps without justification.
- **TypeScript**: Express + ws gateway. Follow existing skill patterns.
- **No hardcoded colors** — use theme constants.
- **No secrets in code** — use environment variables.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, etc.

## PR Process

1. All PRs target `develop` (never `main` directly)
2. CI must pass (architecture lint, skills tests, builds)
3. Claude AI reviews automatically
4. Squash-merge preferred

## Testing

- Skills: `cd openclaw-skills && npm test`
- Android: `cd android && ./gradlew testDebugUnitTest`
- iOS: Xcode test runner or `xcodebuild test`
