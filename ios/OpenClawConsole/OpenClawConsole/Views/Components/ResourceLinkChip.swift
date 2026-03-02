// Views/Components/ResourceLinkChip.swift
// OpenClaw Work Console
// Tappable link chip with icon for task resource links.

import SwiftUI

struct ResourceLinkChip: View {
    let link: ResourceLink

    var body: some View {
        Link(destination: URL(string: link.url) ?? URL(string: "https://")!) {
            Label {
                Text(link.label)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
            } icon: {
                Image(systemName: link.type.systemImage)
                    .font(.caption)
            }
            .foregroundStyle(.blue)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(.secondarySystemBackground), in: Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(Color.blue.opacity(0.3), lineWidth: 1)
            )
        }
        .accessibilityLabel(link.label)
        .accessibilityHint("Opens \(link.type.systemImage) link")
    }
}

// MARK: - Resource Links Row

struct ResourceLinksRow: View {
    let links: [ResourceLink]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(links) { link in
                    ResourceLinkChip(link: link)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }
}

#Preview {
    ResourceLinksRow(links: [
        ResourceLink(label: "PR #42", url: "https://github.com", type: .githubPR),
        ResourceLink(label: "CI Run", url: "https://github.com/actions", type: .githubRun),
        ResourceLink(label: "Dashboard", url: "https://grafana.example.com", type: .dashboard)
    ])
    .padding()
}
