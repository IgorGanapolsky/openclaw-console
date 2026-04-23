// Theme/Theme.swift
// OpenClaw Work Console
// Simple theme system with semantic color helpers

import SwiftUI

// MARK: - Theme Preview Helpers

#if DEBUG
struct OpenClawTheme_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 16) {
            // Typography Examples
            Text("Display Large")
                .displayLarge()

            Text("Headline Medium")
                .headlineMedium()

            Text("Body Large")
                .bodyLarge()

            Text("Label Small")
                .labelSmall()

            Text("Monospace Code")
                .monospace()

            // Color Examples
            HStack(spacing: 8) {
                Rectangle()
                    .fill(Color.severityCritical)
                    .frame(width: 40, height: 40)

                Rectangle()
                    .fill(Color.severityWarning)
                    .frame(width: 40, height: 40)

                Rectangle()
                    .fill(Color.severityInfo)
                    .frame(width: 40, height: 40)
            }

            HStack(spacing: 8) {
                Circle()
                    .fill(Color.statusOnline)
                    .frame(width: 16, height: 16)

                Circle()
                    .fill(Color.statusOffline)
                    .frame(width: 16, height: 16)

                Circle()
                    .fill(Color.statusBusy)
                    .frame(width: 16, height: 16)
            }
        }
        .padding()
        .preferredColorScheme(.light)
        .previewDisplayName("Light Theme")

        VStack(spacing: 16) {
            Text("Display Large")
                .displayLarge()

            Text("Headline Medium")
                .headlineMedium()

            Text("Body Large")
                .bodyLarge()

            // Color Examples
            HStack(spacing: 8) {
                Rectangle()
                    .fill(Color.severityCritical)
                    .frame(width: 40, height: 40)

                Rectangle()
                    .fill(Color.severityWarning)
                    .frame(width: 40, height: 40)

                Rectangle()
                    .fill(Color.severityInfo)
                    .frame(width: 40, height: 40)
            }
        }
        .padding()
        .preferredColorScheme(.dark)
        .previewDisplayName("Dark Theme")
    }
}
#endif