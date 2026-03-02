// Views/Incidents/IncidentDetailView.swift
// OpenClaw Work Console
// Incident detail with severity banner, actions, and loading states.

import SwiftUI

struct IncidentDetailView: View {
    let incident: Incident
    @Bindable var viewModel: IncidentListViewModel

    @State private var isActioning: Bool = false
    @State private var actionError: String?
    @State private var actionConfirmation: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // MARK: Severity Banner
                severityBanner

                // MARK: Status
                statusRow

                // MARK: Description
                descriptionSection

                // MARK: Agent Link
                agentSection

                Divider()

                // MARK: Action Buttons
                actionsSection
            }
            .padding(16)
        }
        .navigationTitle(incident.title)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Action Error", isPresented: .constant(actionError != nil)) {
            Button("OK") { actionError = nil }
        } message: {
            if let error = actionError {
                Text(error)
            }
        }
        .overlay {
            if isActioning {
                ZStack {
                    Color.black.opacity(0.3)
                        .ignoresSafeArea()
                    ProgressView("Processing…")
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    // MARK: - Severity Banner

    private var severityBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: incident.severity.systemImage)
                .font(.title2.weight(.semibold))
            Text(incident.severity.displayName)
                .font(.title3.weight(.semibold))
            Spacer()
        }
        .foregroundStyle(incident.severity.color)
        .padding(14)
        .background(incident.severity.color.opacity(0.1),
                    in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Status Row

    private var statusRow: some View {
        HStack {
            Label("Status", systemImage: "info.circle")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(incident.status.displayName)
                .font(.subheadline.weight(.medium))
        }
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Description")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(incident.description)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }

    // MARK: - Agent Section

    private var agentSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Owning Agent")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            HStack(spacing: 8) {
                Image(systemName: "cpu")
                    .foregroundStyle(.blue)
                Text(incident.agentName)
                    .font(.subheadline.weight(.medium))
                Spacer()
                TimeAgoText(date: incident.createdAt)
            }
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Actions")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            if incident.status == .resolved {
                Text("This incident has been resolved.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(incident.actions, id: \.self) { action in
                    actionButton(for: action)
                }
            }

            if let confirmation = actionConfirmation {
                Label(confirmation, systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
    }

    private func actionButton(for action: IncidentAction) -> some View {
        Button(action: { performAction(action) }) {
            Label(action.displayName, systemImage: action.systemImage)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(isActioning)
        .tint(action == .acknowledge ? .green : .blue)
    }

    // MARK: - Action Handler

    private func performAction(_ action: IncidentAction) {
        actionError = nil
        actionConfirmation = nil
        isActioning = true

        Swift.Task {
            await viewModel.triggerAction(action, for: incident)
            await MainActor.run {
                isActioning = false
                if let error = viewModel.errorMessage {
                    actionError = error
                } else {
                    actionConfirmation = "Request sent to \(incident.agentName)."
                }
            }
        }
    }
}

#Preview {
    let ws = WebSocketService()
    let vm = IncidentListViewModel(webSocket: ws)
    NavigationStack {
        IncidentDetailView(
            incident: Incident(
                id: "i1",
                agentId: "a1",
                agentName: "Deploy Agent",
                severity: .critical,
                title: "Deployment failed in production",
                description: "The latest deploy to production failed due to a health check timeout.",
                status: .open,
                createdAt: Date().addingTimeInterval(-600),
                updatedAt: Date().addingTimeInterval(-300),
                actions: [.askRootCause, .proposeFix, .acknowledge]
            ),
            viewModel: vm
        )
        .environment(ws)
    }
}
