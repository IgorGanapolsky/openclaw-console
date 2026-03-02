# Architecture

## Overview

The OpenClaw Work Console is a mobile-first monitoring and control system for OpenClaw agents. It consists of three components:

1. **Mobile Apps** (iOS + Android) — Thin clients that display agent status, tasks, incidents, and approvals
2. **Gateway Server** — A Node.js/TypeScript service that exposes HTTP REST + WebSocket APIs
3. **Skills** — Server-side modules that produce events (tasks, incidents, approvals) consumed by the mobile apps

## Design Principles

- **Server-side intelligence, client-side display.** The mobile apps never call GitHub, trading APIs, or any external service directly. Everything goes through OpenClaw skills.
- **Task-centric, not chat-centric.** The primary unit of work is a Task with a timeline of Steps, not a stream of chat messages.
- **Secure by default.** Tokens in platform-secure storage, biometric-gated approvals, TLS enforced, VPN-friendly.
- **Single-purpose.** No social features, no feeds, no media sharing. This is a work tool.

## System Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        USER'S PHONE                             │
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │    iOS App        │         │   Android App     │              │
│  │                   │         │                   │              │
│  │  ┌─────────────┐ │         │  ┌─────────────┐ │              │
│  │  │ WebSocket   │ │         │  │ OkHttp WS   │ │              │
│  │  │ Client      │ │         │  │ Client      │ │              │
│  │  └──────┬──────┘ │         │  └──────┬──────┘ │              │
│  │         │        │         │         │        │              │
│  │  ┌──────┴──────┐ │         │  ┌──────┴──────┐ │              │
│  │  │ API Service │ │         │  │ ApiService  │ │              │
│  │  └──────┬──────┘ │         │  └──────┬──────┘ │              │
│  └─────────┼────────┘         └─────────┼────────┘              │
│            │                            │                        │
└────────────┼────────────────────────────┼────────────────────────┘
             │          WSS/HTTPS         │
             └─────────────┬──────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                    OPENCLAW GATEWAY                              │
│                   (Your VPS / Server)                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Gateway Server (Express + ws)                            │  │
│  │                                                            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  │  │
│  │  │ HTTP REST  │  │ WebSocket  │  │ Auth / Token Mgr   │  │  │
│  │  │ Endpoints  │  │ Handler    │  │                    │  │  │
│  │  └─────┬──────┘  └─────┬──────┘  └────────────────────┘  │  │
│  │        │               │                                   │  │
│  │        └───────┬───────┘                                   │  │
│  │                │                                            │  │
│  │         ┌──────┴──────┐                                    │  │
│  │         │ State Mgr   │ (In-memory: agents, tasks,        │  │
│  │         │             │  incidents, approvals)              │  │
│  │         └──────┬──────┘                                    │  │
│  └────────────────┼──────────────────────────────────────────┘  │
│                   │                                              │
│  ┌────────────────┼──────────────────────────────────────────┐  │
│  │  Skills Layer  │                                           │  │
│  │                │                                            │  │
│  │  ┌─────────┐ ┌┴────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │CI       │ │Incident │ │Approval  │ │Trading       │  │  │
│  │  │Monitor  │ │Manager  │ │Gate      │ │Monitor       │  │  │
│  │  └────┬────┘ └────┬────┘ └────┬─────┘ └──────┬───────┘  │  │
│  │       │           │           │               │           │  │
│  └───────┼───────────┼───────────┼───────────────┼───────────┘  │
│          │           │           │               │              │
└──────────┼───────────┼───────────┼───────────────┼──────────────┘
           │           │           │               │
           ▼           ▼           ▼               ▼
     GitHub API    Your Infra   Shell/Docker   Trading APIs
     (CI/CD)       (servers)    (commands)     (Alpaca, etc)
```

## Protocol

See [protocol.md](protocol.md) for the complete WebSocket/HTTP message contracts.

### Connection Flow

1. App opens → User selects a saved gateway
2. App calls `GET /api/health` to verify connectivity
3. App opens WebSocket: `wss://gateway/ws?token=xxx`
4. Server sends `connected` event with session info
5. App sends `subscribe` event with agent IDs to watch
6. Server streams real-time events (task updates, incidents, approvals)

### Approval Flow

```
Mobile App                    Gateway                     Skill
    │                            │                           │
    │                            │    requestApproval()      │
    │                            │◄──────────────────────────│
    │    approval_request (WS)   │                           │
    │◄───────────────────────────│                           │
    │                            │                           │
    │  [User sees approval UI]   │                           │
    │  [Biometric verification]  │                           │
    │                            │                           │
    │    approval_response (WS)  │                           │
    │───────────────────────────►│                           │
    │                            │    resolve(approved)      │
    │                            │──────────────────────────►│
    │                            │                           │
    │                            │    [Skill executes or     │
    │                            │     cancels action]       │
```

### Data Flow

- **Tasks** are created by skills when they start work (CI run, deploy, trading analysis)
- **TaskSteps** are appended as work progresses (log entries, tool calls, outputs)
- **Incidents** are created when something goes wrong (CI failure, trading anomaly, error spike)
- **ApprovalRequests** are created when a skill wants to do something dangerous
- All entities are stored in the gateway's StateManager and broadcast to subscribed mobile clients

## Design Decisions

### Why Native (Not React Native)?

Given this is a work tool handling security-critical flows (biometric approval of infrastructure actions), native gives:
- Direct Keychain / Android Keystore access without bridging
- Native biometric APIs (LocalAuthentication / BiometricPrompt)
- Best possible WebSocket performance and lifecycle handling
- No JavaScript bridge overhead for real-time event processing

### Why No Separate Backend?

The gateway IS the backend. It runs inside the user's OpenClaw instance. This means:
- No additional server to manage
- Data never leaves the user's infrastructure
- The user controls all access via their own VPN/firewall
- Skills have direct access to the same state the mobile apps consume

### Why In-Memory State?

For an MVP, in-memory state is the simplest approach. The gateway starts with seed data and skills populate it during runtime. For production:
- State can be persisted to SQLite or Redis
- The StateManager interface is designed to be swappable
- Historical data can be backed by a proper database

### Assumptions About OpenClaw

This project assumes OpenClaw can:
1. Run a Node.js process alongside its main agent loop
2. Expose HTTP/WebSocket endpoints on a configurable port
3. Be configured to route "dangerous" actions through an approval gate
4. Emit structured events when tasks and incidents occur

These assumptions are documented here so they can be adjusted as OpenClaw's actual API stabilizes. The gateway server in `openclaw-skills/` acts as a reference implementation that can be adapted.

## Security Model

### Token Auth
- Single shared secret per gateway connection
- Tokens stored: iOS Keychain (kSecClassGenericPassword), Android EncryptedSharedPreferences (AES256-GCM via Android Keystore)
- Tokens never logged, never appear in UI

### Network
- WSS/HTTPS enforced by default
- Plain HTTP/WS requires explicit user opt-in with warning banner
- Designed for VPN deployment (Tailscale/WireGuard)
- No ports need to be exposed to the public internet if using VPN

### Approval Security
- Biometric verification required for every approval
- Approval requests expire (configurable, default 5 minutes)
- Full command/endpoint displayed to user before approval
- All decisions are audit-logged server-side
