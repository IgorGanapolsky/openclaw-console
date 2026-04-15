// Views/Components/ThumbGateStatusBar.swift
// OpenClaw Work Console
// ThumbGate v1.0 status bar showing thumbs up/down from ~/.openclaw/thumbgate.json

import SwiftUI
import Foundation

/// ThumbGate status bar component that displays v1.0 👍/👎 from ~/.openclaw/thumbgate.json
struct ThumbGateStatusBar: View {
    @State private var thumbsData: ThumbGateData?
    @State private var isLoading = true

    private let fileManager = FileManager.default

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "hand.thumbsup.fill")
                .foregroundStyle(.blue)
                .font(.caption)

            Text("v1.0")
                .font(.caption.weight(.medium))
                .foregroundStyle(.primary)

            if isLoading {
                ProgressView()
                    .controlSize(.mini)
            } else if let data = thumbsData {
                HStack(spacing: 4) {
                    Text("👍")
                        .font(.caption)
                    Text("\(data.thumbsUp)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.green)

                    Text("👎")
                        .font(.caption)
                    Text("\(data.thumbsDown)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.red)
                }
            } else {
                Text("No data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(.systemGray6))
        .cornerRadius(8)
        .task {
            await loadThumbGateData()
        }
        .onReceive(NotificationCenter.default.publisher(for: .thumbGateUpdated)) { _ in
            Task {
                await loadThumbGateData()
            }
        }
    }

    private func loadThumbGateData() async {
        isLoading = true

        do {
            let homeDirectory = fileManager.homeDirectoryForCurrentUser
            let thumbGateFile = homeDirectory.appendingPathComponent(".openclaw/thumbgate.json")

            let data = try Data(contentsOf: thumbGateFile)
            let decoded = try JSONDecoder().decode(ThumbGateData.self, from: data)

            await MainActor.run {
                self.thumbsData = decoded
                self.isLoading = false
            }
        } catch {
            // If file doesn't exist, create it with default values
            await createDefaultThumbGateFile()

            await MainActor.run {
                self.thumbsData = ThumbGateData(thumbsUp: 0, thumbsDown: 0)
                self.isLoading = false
            }
        }
    }

    private func createDefaultThumbGateFile() async {
        let homeDirectory = fileManager.homeDirectoryForCurrentUser
        let openclawDirectory = homeDirectory.appendingPathComponent(".openclaw")
        let thumbGateFile = openclawDirectory.appendingPathComponent("thumbgate.json")

        do {
            // Create .openclaw directory if it doesn't exist
            try fileManager.createDirectory(at: openclawDirectory, withIntermediateDirectories: true)

            let defaultData = ThumbGateData(thumbsUp: 0, thumbsDown: 0)
            let jsonData = try JSONEncoder().encode(defaultData)
            try jsonData.write(to: thumbGateFile)
        } catch {
            print("[ThumbGate] Failed to create default file: \(error)")
        }
    }
}

/// Data structure for ThumbGate JSON file
struct ThumbGateData: Codable {
    let thumbsUp: Int
    let thumbsDown: Int

    enum CodingKeys: String, CodingKey {
        case thumbsUp = "thumbs_up"
        case thumbsDown = "thumbs_down"
    }
}

/// Notification name for ThumbGate updates
extension Notification.Name {
    static let thumbGateUpdated = Notification.Name("ThumbGateUpdated")
}

#Preview {
    ThumbGateStatusBar()
        .padding()
}