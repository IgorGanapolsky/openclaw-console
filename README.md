# OpenClaw Work Console

A focused mobile cockpit for monitoring and controlling [OpenClaw](https://github.com/openclaw) agents. Native iOS and Android apps with zero social-app dependencies.

> **Not a chat app.** This is a single-purpose work console for developers, DevOps engineers, indie hackers, and trading/infra builders who self-host OpenClaw and want to supervise agents from their phone.

---

## Vision

A world where every developer, operator, and builder has a quiet, powerful mobile control plane for their AI agents and infrastructure — free from the noise and distraction of social messaging apps.

## Mission

Deliver the definitive native mobile console for [OpenClaw](https://github.com/openclaw) that lets self-hosting professionals monitor agents, approve dangerous actions with biometric safety, and supervise CI/deployments/trading from their pocket — with zero dependency on Telegram, WhatsApp, Slack, or Discord.

## North Star Metric

**Daily Active Approvers** — the number of unique users who approve at least one agent action per day via the console. This metric captures real operational trust: users are not just viewing dashboards, they are actively governing their infrastructure through the app. Every feature we build should move this number up.

---

## What It Does

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
├── ios/                          # iOS app (Swift/SwiftUI)
│   └── OpenClawConsole/
│       └── OpenClawConsole/
│           ├── Models/           # Data models (Codable)
│           ├── Services/         # Keychain, WebSocket, API, Biometric
│           ├── ViewModels/       # @Observable view models
│           └── Views/            # SwiftUI views
├── android/                      # Android app (Kotlin/Compose)
│   └── app/src/main/java/com/openclaw/console/
│       ├── data/                 # Models, network, repositories
│       ├── service/              # Secure storage, biometric
│       └── ui/                   # Compose screens, theme, nav
├── openclaw-skills/              # Server-side TypeScript skills
│   ├── src/
│   │   ├── gateway/              # Express + WebSocket server
│   │   ├── skills/               # CI, incidents, approvals, trading
│   │   ├── config/               # Default config, agents, seed data
│   │   └── types/                # Shared TypeScript types
│   └── tests/                    # Jest tests
├── docs/                         # Documentation
│   ├── architecture.md           # Full architecture and protocol
│   ├── protocol.md               # WebSocket/HTTP message contracts
│   └── openclaw-setup.md         # Installation guide
└── .github/workflows/            # CI for iOS, Android, and skills
```

## Quickstart

### 1. Set Up the OpenClaw Skills (Server Side)

```bash
cd openclaw-skills
npm install
npm run dev
```

This starts the gateway on `http://localhost:18789` with seed data and a dev token. See [docs/openclaw-setup.md](docs/openclaw-setup.md) for production setup.

### 2. Build the iOS App

```bash
cd ios/OpenClawConsole
open OpenClawConsole.xcodeproj
# Or from command line:
xcodebuild build -scheme OpenClawConsole -destination 'platform=iOS Simulator,name=iPhone 15'
```

In the app, go to Settings → Add Gateway → enter your gateway URL and token.

### 3. Build the Android App

```bash
cd android
./gradlew assembleDebug
# Install on device/emulator:
adb install app/build/outputs/apk/debug/app-debug.apk
```

In the app, go to Settings → Add Gateway → enter your gateway URL and token.

## Configuration

### Gateway Token

On first run, the skills server generates a dev token printed to console. For production:

```bash
# Generate a new token
curl -X POST http://localhost:18789/api/tokens/generate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
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

- All connections should use TLS (HTTPS/WSS) in production
- Tokens stored securely: iOS Keychain / Android EncryptedSharedPreferences
- Approval flow requires biometric (Face ID / fingerprint) verification
- HTTP connections show a warning and require explicit opt-in
- Designed for VPN use — configure your gateway behind Tailscale/WireGuard

## Tech Stack

| Component | Technology |
|-----------|------------|
| iOS | Swift 5.9, SwiftUI, iOS 17+, URLSessionWebSocketTask |
| Android | Kotlin 1.9, Jetpack Compose, Material 3, OkHttp WebSocket |
| Server | TypeScript, Node.js, Express, ws library |
| CI | GitHub Actions (Xcode, Gradle, Node) |

## License

MIT
