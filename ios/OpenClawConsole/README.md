# OpenClaw Console – iOS App

A focused work console for monitoring and controlling OpenClaw agents from an iPhone.

## Requirements

- Xcode 15+
- iOS 17+ deployment target
- Swift 5.9+

## Architecture

**MVVM + @Observable (iOS 17 Observation framework)**

```
OpenClawConsole/
├── Models/            # Codable data types matching protocol.md
│   ├── Agent.swift
│   ├── Task.swift
│   ├── Incident.swift
│   ├── ApprovalRequest.swift
│   ├── ChatMessage.swift
│   ├── GatewayConnection.swift
│   └── WebSocketMessage.swift
│
├── Services/          # Infrastructure layer
│   ├── KeychainService.swift     # Secure token storage (Security.framework)
│   ├── WebSocketService.swift    # URLSessionWebSocketTask + exponential backoff
│   ├── APIService.swift          # REST client (async/await)
│   ├── BiometricService.swift    # Face ID / Touch ID (LocalAuthentication)
│   └── NotificationService.swift # Local notifications (UserNotifications)
│
├── ViewModels/        # @Observable classes; one per major screen
│   ├── GatewayManager.swift
│   ├── AgentListViewModel.swift
│   ├── TaskListViewModel.swift
│   ├── TaskDetailViewModel.swift
│   ├── IncidentListViewModel.swift
│   └── ApprovalViewModel.swift
│
└── Views/
    ├── ContentView.swift          # Root: onboarding or MainTabView
    ├── MainTabView.swift          # 3-tab shell + approval banner
    ├── Agents/
    │   ├── AgentListView.swift    # Search, filter, status dots
    │   └── AgentDetailView.swift  # Tasks | Chat segment
    ├── Tasks/
    │   ├── TaskListView.swift     # Status badges, filter
    │   └── TaskDetailView.swift   # Vertical timeline + inline chat
    ├── Incidents/
    │   ├── IncidentListView.swift  # Severity filter
    │   └── IncidentDetailView.swift# Actions: root cause, fix, ack
    ├── Approvals/
    │   ├── ApprovalBannerView.swift # Sticky orange banner
    │   └── ApprovalDetailView.swift # Full-screen biometric flow
    ├── Chat/
    │   └── ChatView.swift          # Bubbles + send
    ├── Settings/
    │   ├── GatewayListView.swift   # CRUD gateways
    │   └── AddGatewayView.swift    # Test & Save form
    └── Components/
        ├── StatusDot.swift
        ├── SeverityBadge.swift
        ├── TimeAgoText.swift
        └── ResourceLinkChip.swift
```

## Key Design Decisions

### Security
- Gateway tokens stored exclusively in iOS Keychain (`kSecClassGenericPassword`)
- Tokens never appear in logs, UserDefaults, or URLs
- Approval actions require biometric verification (Face ID / Touch ID)
- App Transport Security enforces HTTPS by default; HTTP triggers an in-app warning

### Real-Time Updates
- Single `WebSocketService` instance shared across all ViewModels via `@Environment`
- Exponential backoff reconnection: 1s → 2s → 4s → 8s → … → 30s max
- 30-second ping/pong keepalive to detect stale connections
- ViewModels subscribe to `eventPublisher` (Combine `PassthroughSubject`) and update their own state

### State Management
- `@Observable` throughout (iOS 17 Observation framework, no `ObservableObject`)
- `@Bindable` for ViewModels passed as init parameters
- `@Environment` for global singletons (`GatewayManager`, `WebSocketService`, `ApprovalViewModel`)
- `@State` for local, view-scoped state

## Setup

1. Generate an Xcode project (required for signing/TestFlight):
   `xcodegen generate`
2. Open `OpenClawConsole.xcodeproj` in Xcode
3. Set deployment target to **iOS 17.0**
4. Add required capabilities in Xcode: **Keychain Sharing** (optional), **Face ID**
5. The `Info.plist` in this directory contains all required privacy strings

## Required Info.plist Keys

| Key | Purpose |
|-----|---------|
| `NSFaceIDUsageDescription` | Required to use Face ID for approvals |
| `NSLocalNetworkUsageDescription` | Required for HTTP/WS to local gateways |

## No Third-Party Dependencies

The app uses only Apple frameworks:
- `SwiftUI` – UI
- `Foundation` – Networking, JSON, dates
- `Combine` – Event streams from WebSocket
- `Security` – Keychain
- `LocalAuthentication` – Face ID / Touch ID
- `UserNotifications` – Local notifications for approvals and incidents
