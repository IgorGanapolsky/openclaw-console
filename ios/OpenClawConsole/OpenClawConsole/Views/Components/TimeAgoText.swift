// Views/Components/TimeAgoText.swift
// OpenClaw Work Console
// Relative time display (e.g., "2 min ago", "3 days ago").

import SwiftUI

struct TimeAgoText: View {
    let date: Date
    var style: Font = .caption
    var color: Color = .secondary

    @State private var displayText: String = ""

    private static let formatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()

    var body: some View {
        Text(displayText)
            .font(style)
            .foregroundStyle(color)
            .onAppear { update() }
            // Refresh every minute
            .task {
                while !Swift.Task.isCancelled {
                    update()
                    try? await Swift.Task.sleep(nanoseconds: 60_000_000_000)
                }
            }
            .accessibilityLabel(accessibilityDate)
    }

    private func update() {
        displayText = Self.formatter.localizedString(for: date, relativeTo: Date())
    }

    private var accessibilityDate: String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 8) {
        TimeAgoText(date: Date().addingTimeInterval(-60))
        TimeAgoText(date: Date().addingTimeInterval(-3600))
        TimeAgoText(date: Date().addingTimeInterval(-86400))
    }
    .padding()
}
