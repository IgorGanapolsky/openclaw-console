// Views/ContentView.swift
// OpenClaw Work Console
// Root view: shows onboarding if no gateway configured, otherwise main TabView.

import SwiftUI

struct ContentView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @Environment(ApprovalViewModel.self) private var approvalViewModel

    var body: some View {
        Group {
            if gatewayManager.isConfigured {
                MainTabView()
            } else {
                OnboardingView()
            }
        }
        .task {
            // Request notification permission on first launch
            await NotificationService.shared.requestAuthorization()
        }
    }
}

// MARK: - OnboardingView

/// Shown when no gateway is configured.
private struct OnboardingView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @State private var showAddGateway = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                Image(systemName: "network.badge.shield.half.filled")
                    .font(.system(size: 72))
                    .foregroundStyle(.blue)

                VStack(spacing: 8) {
                    Text("OpenClaw Console")
                        .font(.largeTitle.weight(.bold))
                    Text("Connect to a gateway to start monitoring and controlling your agents.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Button(action: { showAddGateway = true }) {
                    Label("Add Gateway", systemImage: "plus.circle.fill")
                        .font(.headline)
                        .frame(minWidth: 0, maxWidth: .infinity)
                        .padding()
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 32)
                .frame(minHeight: 44)

                Spacer()
            }
            .navigationTitle("")
            .navigationBarHidden(true)
            .sheet(isPresented: $showAddGateway) {
                NavigationStack {
                    AddGatewayView()
                }
            }
        }
    }
}
