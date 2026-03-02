// Views/Components/StatusDot.swift
// OpenClaw Work Console
// Reusable 8pt colored dot for agent/connection status.

import SwiftUI

// MARK: - StatusDot

struct StatusDot: View {
    let status: AgentStatus
    var size: CGFloat = 8

    var color: Color {
        switch status {
        case .online: return .green
        case .busy: return .yellow
        case .offline: return Color(.systemGray3)
        }
    }

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .accessibilityLabel(status.displayName)
    }
}

// MARK: - ConnectionStatusDot

struct ConnectionStatusDot: View {
    let status: GatewayConnectionStatus
    var size: CGFloat = 8

    var color: Color {
        switch status {
        case .connected: return .green
        case .failed: return .red
        case .checking: return .yellow
        case .unknown: return Color(.systemGray3)
        }
    }

    var isAnimating: Bool {
        if case .checking = status { return true }
        return false
    }

    @State private var pulsing = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .opacity(isAnimating ? (pulsing ? 0.4 : 1.0) : 1.0)
            .animation(isAnimating ? .easeInOut(duration: 0.6).repeatForever() : .default,
                       value: pulsing)
            .onAppear {
                if isAnimating { pulsing = true }
            }
            .onChange(of: isAnimating) { _, animating in
                pulsing = animating
            }
            .accessibilityLabel(statusLabel)
    }

    private var statusLabel: String {
        switch status {
        case .connected: return "Connected"
        case .failed(let msg): return "Failed: \(msg)"
        case .checking: return "Checking connection"
        case .unknown: return "Unknown"
        }
    }
}

#Preview {
    HStack(spacing: 12) {
        StatusDot(status: .online)
        StatusDot(status: .busy)
        StatusDot(status: .offline)
        ConnectionStatusDot(status: .connected)
        ConnectionStatusDot(status: .checking)
        ConnectionStatusDot(status: .failed("timeout"))
    }
    .padding()
}
