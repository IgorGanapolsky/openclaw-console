// OpenClawConsoleApp.swift
// OpenClaw Work Console
// @main App struct – sets up GatewayManager and root view.
//
// Required Info.plist entries (add to Info.plist or via target settings):
//   NSFaceIDUsageDescription  → "OpenClaw Console uses Face ID to verify approval actions."
//   NSLocalNetworkUsageDescription → "OpenClaw Console connects to local gateway servers on your network."
//   NSAppTransportSecurity / NSAllowsArbitraryLoads → false (TLS required by default)
//   UIBackgroundModes → none required (no background processing)

import SwiftUI

@main
struct OpenClawConsoleApp: App {

    @State private var gatewayManager = GatewayManager()
    // webSocketService and approvalViewModel share the same WS instance.
    // They are stored as @State so the App owns their lifetime.
    @State private var services = AppServices()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(gatewayManager)
                .environment(services.webSocket)
                .environment(services.approvalViewModel)
        }
    }
}

/// Holds shared services that depend on each other.
/// Constructed once and owned by the App.
private final class AppServices {
    let webSocket: WebSocketService
    let approvalViewModel: ApprovalViewModel

    init() {
        let ws = WebSocketService()
        webSocket = ws
        approvalViewModel = ApprovalViewModel(webSocket: ws)
    }
}
