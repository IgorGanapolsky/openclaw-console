// Views/Components/ConnectionStatusBanner.swift
// OpenClaw Work Console
// Connection status banner matching Android Material 3 design for platform parity

import SwiftUI
import Foundation
import os

struct ConnectionStatusBanner: View {
    let status: GatewayConnectionStatus
    @Environment(GatewayManager.self) private var gatewayManager

    var body: some View {
        if shouldShowBanner {
            HStack(spacing: 12) {
                // Status icon
                Image(systemName: statusIconName)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(statusColor)

                // Status text
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusTitle)
                        .font(.openClawTitleSmall)
                        .foregroundStyle(statusColor)

                    if let subtitle = statusSubtitle {
                        Text(subtitle)
                            .font(.openClawBodySmall)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer()

                // Action button (if needed)
                if case .failed = status {
                    Button("Retry") {
                        reconnectGateway()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(statusColor)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(statusBackgroundColor)
                    .stroke(statusColor.opacity(0.3), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    // MARK: - Computed Properties

    private var shouldShowBanner: Bool {
        switch status {
        case .connected:
            return false // Hide when connected (good state)
        case .unknown, .checking, .failed:
            return true
        }
    }

    private var statusIconName: String {
        switch status {
        case .unknown:
            return "questionmark.circle.fill"
        case .checking:
            return "arrow.clockwise.circle.fill"
        case .connected:
            return "checkmark.circle.fill"
        case .failed:
            return "exclamationmark.triangle.fill"
        }
    }

    private var statusColor: Color {
        switch status {
        case .unknown:
            return .statusOffline
        case .checking:
            return .statusBusy
        case .connected:
            return .statusOnline
        case .failed:
            return .severityCritical
        }
    }

    private var statusBackgroundColor: Color {
        switch status {
        case .unknown:
            return Color.statusOffline.opacity(0.1)
        case .checking:
            return Color.statusBusy.opacity(0.1)
        case .connected:
            return Color.statusOnline.opacity(0.1)
        case .failed:
            return Color.severityCriticalContainer
        }
    }

    private var statusTitle: String {
        switch status {
        case .unknown:
            return "Gateway Status Unknown"
        case .checking:
            return "Connecting to Gateway..."
        case .connected:
            return "Connected to Gateway"
        case .failed:
            return "Gateway Connection Failed"
        }
    }

    private var statusSubtitle: String? {
        switch status {
        case .unknown:
            return "Unable to determine gateway connection status"
        case .checking:
            return "Establishing connection to \(gatewayManager.activeGateway?.name ?? "gateway")"
        case .connected:
            return nil // Don't show subtitle for connected state
        case .failed(let message):
            return message.isEmpty ? "Please check your connection settings" : message
        }
    }

    // MARK: - Actions

    private func reconnectGateway() {
        // Trigger reconnection through GatewayManager
        // This would typically call the WebSocket reconnection logic
        guard let gateway = gatewayManager.activeGateway,
              let token = KeychainService.shared.retrieve(for: gateway.id) else {
            return
        }

        // You would implement the reconnection logic here
        // For now, this is a placeholder
        Logger().info("Attempting to reconnect to \(gateway.name)...")
    }
}

// MARK: - Preview

#if DEBUG
struct ConnectionStatusBanner_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 16) {
            ConnectionStatusBanner(status: .checking)
            ConnectionStatusBanner(status: .failed("Unable to reach server"))
            ConnectionStatusBanner(status: .unknown)
        }
        .padding()
        .previewLayout(.sizeThatFits)
    }
}
#endif
