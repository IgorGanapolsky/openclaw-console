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
@available(iOS 17.0, *)
struct OpenClawConsoleApp: App {

    @State private var gatewayManager = GatewayManager()
    // webSocketService and approvalViewModel share the same WS instance.
    // They are stored as @State so the App owns their lifetime.
    @State private var services = AppServices()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(gatewayManager)
                .environmentObject(services.webSocket)
                .environment(services.approvalViewModel)
                .environment(services.subscriptionService)
        }
    }
}

/// Holds shared services that depend on each other.
/// Constructed once and owned by the App.
@available(iOS 17.0, *)
private final class AppServices {
    let webSocket: WebSocketService
    let approvalViewModel: ApprovalViewModel
    let subscriptionService: SubscriptionService

    init() {
        let ws = WebSocketService()
        webSocket = ws
        approvalViewModel = ApprovalViewModel(webSocket: ws)
        subscriptionService = SubscriptionService()

        // Initialize RevenueCat
        configureSubscriptionService()
    }

    private func configureSubscriptionService() {
        // Get RevenueCat API key from configuration
        let apiKey = getRevenueCatApiKey()

        if !apiKey.isEmpty {
            subscriptionService.configure(apiKey: apiKey)
            print("[AppServices] RevenueCat initialized successfully")
        } else {
            print("[AppServices] RevenueCat API key not configured - subscription features disabled")
        }
    }

    private func getRevenueCatApiKey() -> String {
        // In production, this should come from secure configuration or build settings
        // For now, return empty string (would be configured during build)
        return Bundle.main.object(forInfoDictionaryKey: "REVENUECAT_API_KEY") as? String ?? ""
    }
}
