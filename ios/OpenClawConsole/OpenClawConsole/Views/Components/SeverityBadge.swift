// Views/Components/SeverityBadge.swift
// OpenClaw Work Console
// Colored severity label for incidents.

import SwiftUI

struct SeverityBadge: View {
    let severity: IncidentSeverity
    var compact: Bool = false

    var body: some View {
        Label {
            if !compact {
                Text(severity.displayName)
                    .font(.caption.weight(.semibold))
            }
        } icon: {
            Image(systemName: severity.systemImage)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(severity.color)
        .padding(.horizontal, compact ? 4 : 8)
        .padding(.vertical, compact ? 2 : 4)
        .background(severity.color.opacity(0.12), in: Capsule())
        .accessibilityLabel("\(severity.displayName) severity")
    }
}

#Preview {
    HStack(spacing: 12) {
        SeverityBadge(severity: .critical)
        SeverityBadge(severity: .warning)
        SeverityBadge(severity: .info)
        SeverityBadge(severity: .critical, compact: true)
    }
    .padding()
}
