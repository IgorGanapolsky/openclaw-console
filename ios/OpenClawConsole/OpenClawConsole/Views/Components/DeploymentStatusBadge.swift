// Views/Components/DeploymentStatusBadge.swift
// OpenClaw Work Console
// Status badge component for deployment states

import SwiftUI

struct DeploymentStatusBadge: View {
    let status: DeploymentStatus
    var size: Size = .medium

    enum Size {
        case small, medium, large

        var fontSize: Font {
            switch self {
            case .small: return .caption2
            case .medium: return .caption
            case .large: return .footnote
            }
        }

        var padding: EdgeInsets {
            switch self {
            case .small: return EdgeInsets(top: 2, leading: 6, bottom: 2, trailing: 6)
            case .medium: return EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
            case .large: return EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
            }
        }

        var iconSize: CGFloat {
            switch self {
            case .small: return 10
            case .medium: return 12
            case .large: return 14
            }
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: status.systemImage)
                .font(.system(size: size.iconSize, weight: .medium))

            Text(status.displayName)
                .font(size.fontSize)
                .fontWeight(.medium)
        }
        .padding(size.padding)
        .background(
            Capsule()
                .fill(backgroundColor)
        )
        .overlay(
            Capsule()
                .stroke(borderColor, lineWidth: 1)
        )
        .foregroundStyle(foregroundColor)
    }

    private var backgroundColor: Color {
        switch status {
        case .pending:
            return .gray.opacity(0.1)
        case .running:
            return .blue.opacity(0.1)
        case .completed:
            return .green.opacity(0.1)
        case .failed:
            return .red.opacity(0.1)
        case .cancelled:
            return .gray.opacity(0.1)
        }
    }

    private var foregroundColor: Color {
        switch status {
        case .pending:
            return .gray
        case .running:
            return .blue
        case .completed:
            return .green
        case .failed:
            return .red
        case .cancelled:
            return .gray
        }
    }

    private var borderColor: Color {
        foregroundColor.opacity(0.3)
    }
}

// MARK: - Convenience Initializers

extension DeploymentStatusBadge {
    static func small(_ status: DeploymentStatus) -> DeploymentStatusBadge {
        DeploymentStatusBadge(status: status, size: .small)
    }

    static func medium(_ status: DeploymentStatus) -> DeploymentStatusBadge {
        DeploymentStatusBadge(status: status, size: .medium)
    }

    static func large(_ status: DeploymentStatus) -> DeploymentStatusBadge {
        DeploymentStatusBadge(status: status, size: .large)
    }
}

// MARK: - Preview

#if DEBUG
struct DeploymentStatusBadge_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 16) {
            // Small badges
            HStack(spacing: 8) {
                ForEach(DeploymentStatus.allCases, id: \.self) { status in
                    DeploymentStatusBadge.small(status)
                }
            }

            // Medium badges
            HStack(spacing: 8) {
                ForEach(DeploymentStatus.allCases, id: \.self) { status in
                    DeploymentStatusBadge.medium(status)
                }
            }

            // Large badges
            VStack(spacing: 8) {
                ForEach(DeploymentStatus.allCases, id: \.self) { status in
                    DeploymentStatusBadge.large(status)
                }
            }
        }
        .padding()
        .previewLayout(.sizeThatFits)
    }
}
#endif