// Views/Bridges/BridgeListView.swift
// OpenClaw Work Console
// Displays active IDE/Terminal bridge sessions (acpx).

import SwiftUI

struct BridgeListView: View {
    let viewModel: BridgeListViewModel

    var body: some View {
        List {
            if viewModel.sessions.isEmpty && !viewModel.isLoading {
                ContentUnavailableView("No Active Bridges", 
                                     systemImage: "link.badge.plus", 
                                     description: Text("Connect an IDE or terminal using acpx to see it here."))
            } else {
                ForEach(viewModel.sessions) { session in
                    BridgeSessionRow(session: session)
                }
            }
        }
        .navigationTitle("IDE Bridges")
        .refreshable {
            await viewModel.fetchBridges()
        }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .alert("Error", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: { _ in }
        )) {
            Button("OK") { }
        } message: {
            if let msg = viewModel.errorMessage {
                Text(msg)
            }
        }
    }
}

struct BridgeSessionRow: View {
    let session: BridgeSession

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(session.title, systemImage: iconName(for: session.type))
                    .font(.headline)
                
                Spacer()
                
                StatusBadge(closed: session.closed)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text("Agent: \(session.agentId)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Text("CWD: \(session.cwd)")
                    .font(.caption2)
                    .monospaced()
                    .foregroundStyle(.primary)
                    .padding(4)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            
            Text("Created: \(session.createdAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private func iconName(for type: String) -> String {
        switch type {
        case "codex": return "command.square"
        case "terminal": return "terminal"
        default: return "link"
        }
    }
}

struct StatusBadge: View {
    let closed: Bool
    
    var body: some View {
        Text(closed ? "Closed" : "Active")
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(closed ? Color.secondary.opacity(0.2) : Color.green.opacity(0.2))
            .foregroundStyle(closed ? Color.secondary : Color.green)
            .clipShape(Capsule())
    }
}
