# OpenClaw Work Console

[![CI](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/ci.yml)
[![Security](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/security.yml/badge.svg)](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/security.yml)
[![Store Listing Parity](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/store-listing-parity.yml/badge.svg)](https://github.com/IgorGanapolsky/openclaw-console/actions/workflows/store-listing-parity.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: iOS 17+](https://img.shields.io/badge/iOS-17%2B-blue)](ios/)
[![Platform: Android 8+](https://img.shields.io/badge/Android-8%2B-green)](android/)

A focused mobile cockpit for monitoring and controlling [OpenClaw](https://github.com/openclaw) agents. Native iOS and Android apps with zero social-app dependencies.

---

## 🚀 Professional Managed Setup

Tired of configuration hell? We build and maintain your **24/7 Mac AI Workstation** for you.

- **Done-For-You Setup:** We configure your Mac Mini, OpenClaw Gateway, and model routing.
- **Managed Revenue-Ops:** Install agent apps like the *WhatsApp Lead Responder* and *Daily Owner Briefing*.
- **Zero-Risk Guarantee:** We deliver in 24 hours or you don't pay.

[**Get the ,500 Managed Revenue System**](https://igorganapolsky.github.io/openclaw-mac-ai-workstation-setup/)

---

> **Not a chat app.** This is a single-purpose work console for developers, DevOps engineers, indie hackers, and trading/infra builders who self-host OpenClaw and want to supervise agents from their phone.

## Vision

A world where every developer, operator, and builder has a quiet, powerful mobile control plane for their AI agents and infrastructure — free from the noise and distraction of social messaging apps.

## Mission

Deliver the definitive native mobile console for [OpenClaw](https://github.com/openclaw) that lets self-hosting professionals monitor agents, approve dangerous actions with biometric safety, and supervise CI/deployments/trading from their pocket — with zero dependency on Telegram, WhatsApp, Slack, or Discord.

## North Star Metric

**Daily Active Approvers (DAA)** — unique users who approve at least one agent action per day. Every feature should move this number up.

---

## Features

| Feature | Description |
|---------|-------------|
| **Gateway Connection** | Connect to one or more OpenClaw instances with secure token auth |
| **Agent Dashboard** | See all your agents, their status, and active workloads |
| **Task Feed** | Track agent tasks (CI runs, deployments, trading jobs) with live timelines |
| **Incidents** | Aggregated alerts across all agents — CI failures, prod errors, trading anomalies |
| **Safe Approvals** | Approve dangerous actions (deploys, shell commands, config changes) with biometric verification |
| **Minimal Chat** | Send quick instructions to agents, attached to tasks |

## Who It's For

- **Solo dev-founders / indie hackers** who run OpenClaw on a VPS to automate GitHub, deployments, and SaaS ops
- **DevOps / SREs** who use OpenClaw to watch CI, logs, and uptime — and need a mobile console for incidents
- **Quant / trading automation builders** who run agents monitoring markets and want approval UIs for strategy changes
- **Small AI / data teams** with OpenClaw wired into GitHub + analytics + internal APIs

## Architecture

```
┌─────────────────┐     WSS/HTTPS     ┌──────────────────────┐
│  iOS App         │◄──────────────────►│                      │
│  (SwiftUI)       │                    │   OpenClaw Gateway   │
└─────────────────┘                    │   (Node.js/TS)       │
                                       │                      │
┌─────────────────┐     WSS/HTTPS     │   ┌────────────────┐ │
│  Android App     │◄──────────────────►│   │ CI Monitor     │ │
│  (Compose)       │                    │   │ Incident Mgr   │ │
└─────────────────┘                    │   │ Approval Gate  │ │
                                       │   │ Trading Mon.   │ │
                                       │   │ Task Manager   │ │
                                       │   └────────────────┘ │
                                       └──────────────────────┘
                                              │
                                              ▼
                                       Your infra: GitHub,
                                       CI/CD, trading APIs,
                                       servers, databases
```

The mobile apps are thin clients. All intelligence lives in OpenClaw skills on your server. The apps connect via WebSocket for real-time updates and HTTPS for REST calls.

See [docs/architecture.md](docs/architecture.md) for the full protocol spec and message contracts.

## Repository Structure

```
openclaw-console/
├── ios/                          # iOS app (Swift 6 / SwiftUI)
│   └── OpenClawConsole/
│       ├── Sources/
│       │   ├── Models/           # Data models (Codable)
│       │   ├── Services/         # Keychain, WebSocket, API, Biometric
│       │   ├── ViewModels/       # @Observable view models
│       │   └── Views/            # SwiftUI views
│       └── fastlane/             # iOS store metadata & delivery
├── android/                      # Android app (Kotlin / Compose)
│   └── app/src/main/java/com/openclaw/console/
│       ├── data/                 # Models, network, repositories
│       ├── service/              # Secure storage, biometric
│       └── ui/                   # Compose screens, theme, nav
│   └── fastlane/                 # Android store metadata & delivery
├── openclaw-skills/              # Server-side TypeScript skills gateway
│   ├── src/
│   │   ├── gateway/              # Express + WebSocket server
│   │   ├── skills/               # CI, incidents, approvals, trading
│   │   └── types/                # Shared TypeScript types
│   └── tests/                    # Jest tests
├── marketing/                    # Store growth, keywords, campaigns
├── scripts/                      # Build, release, and CI scripts
├── docs/                         # Architecture, protocol, setup guides
├── .github/workflows/            # CI/CD for iOS, Android, skills, store
└── .claude/                      # Claude Code rules, skills, hooks
```

## Quickstart

### Prerequisites

- Xcode 15+ (iOS)
- JDK 17 + Android Studio (Android)
- Node.js 20+ (skills gateway)

### 1. Skills Gateway (Server)

```bash
cd openclaw-skills
npm install
npm run dev
# Gateway starts on http://localhost:18789
```

### 2. iOS App

```bash
cd ios/OpenClawConsole
open OpenClawConsole.xcodeproj
# Or CLI:
xcodebuild build -scheme OpenClawConsole \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

### 3. Android App

```bash
cd android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 4. Connect

In either app: Settings -> Add Gateway -> enter your gateway URL and token.

### Using Make

```bash
make setup-dev         # Install tools and dependencies
make verify            # Run all tests + builds
make run-ios-sim       # Launch on iOS Simulator
make run-android-emulator  # Launch on Android emulator
make maestro-ios       # Run Maestro E2E tests (iOS)
make maestro-android   # Run Maestro E2E tests (Android)
make clean-all         # Clean all build artifacts
```

## Configuration

### Gateway Token

```bash
# Dev token printed to console on first run
# Production: generate a new token
curl -X POST http://localhost:18789/api/tokens/generate \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `18789` | Gateway HTTP/WS port |
| `HOST` | `0.0.0.0` | Bind address |
| `TOKEN_FILE` | `./tokens.json` | Path to token store |
| `APPROVAL_TIMEOUT_MS` | `300000` | Approval expiry (5 min) |
| `WS_PING_INTERVAL_MS` | `30000` | WebSocket ping interval |

## Security

- All connections use TLS (HTTPS/WSS) in production
- Tokens stored securely: iOS Keychain / Android EncryptedSharedPreferences
- Approval flow requires biometric (Face ID / fingerprint) verification
- HTTP connections show a warning and require explicit opt-in
- Designed for VPN use — configure your gateway behind Tailscale/WireGuard

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Tech Stack

| Component | Technology |
|-----------|------------|
| iOS | Swift 6, SwiftUI, iOS 17+, URLSessionWebSocketTask |
| Android | Kotlin 2.x, Jetpack Compose, Material 3, Hilt, OkHttp WebSocket |
| Server | TypeScript, Node.js 20, Express, ws library |
| CI/CD | GitHub Actions (Xcode, Gradle, Node), Fastlane |
| E2E | Maestro |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## License

MIT — see [LICENSE](LICENSE).
