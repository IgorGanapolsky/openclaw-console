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
import Foundation
import RevenueCat

@main
@available(iOS 17.0, *)
struct OpenClawConsoleApp: App {

    @State private var gatewayManager = GatewayManager()
    @State private var webSocket = WebSocketService()
    @State private var approvalViewModel: ApprovalViewModel? = nil

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(gatewayManager)
                .environment(webSocket)
                .environment(approvalViewModel ?? ApprovalViewModel(webSocket: webSocket))
                .onAppear {
                    setupServices()
                }
        }
    }

    private func setupServices() {
        if approvalViewModel == nil {
            approvalViewModel = ApprovalViewModel(webSocket: webSocket)
        }

        // Initialize RevenueCat
        let apiKey = getRevenueCatApiKey()
        if !apiKey.isEmpty {
            Purchases.configure(withAPIKey: apiKey)
            print("[OpenClawConsoleApp] RevenueCat initialized successfully")
        } else {
            print("[OpenClawConsoleApp] RevenueCat API key not configured - subscription features disabled")
        }
    }

    private func getRevenueCatApiKey() -> String {
        // In production, this should come from secure configuration or build settings
        // For now, return empty string (would be configured during build)
        return Bundle.main.object(forInfoDictionaryKey: "REVENUECAT_API_KEY") as? String ?? ""
    }
}
