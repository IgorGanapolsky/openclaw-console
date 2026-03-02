// Views/Incidents/IncidentListView.swift
// OpenClaw Work Console
// Global incident list with severity filter and navigation.

import SwiftUI

struct IncidentListView: View {
    @Bindable var viewModel: IncidentListViewModel

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.incidents.isEmpty {
                ProgressView("Loading incidents…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.filteredIncidents.isEmpty {
                emptyState
            } else {
                list
            }
        }
        .navigationTitle("Incidents")
        .toolbar {
            ToolbarItem(placement: .secondaryAction) {
                filterMenu
            }
        }
        .refreshable {
            await viewModel.fetchIncidents()
        }
        .task {
            if viewModel.incidents.isEmpty {
                await viewModel.fetchIncidents()
            }
        }
    }

    // MARK: - List

    private var list: some View {
        List(viewModel.filteredIncidents) { incident in
            NavigationLink(value: incident) {
                IncidentRow(incident: incident)
            }
            .frame(minHeight: 44)
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Incident.self) { incident in
            IncidentDetailView(incident: incident, viewModel: viewModel)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                viewModel.severityFilter == nil ? "No Incidents" : "No \(viewModel.severityFilter!.displayName) Incidents",
                systemImage: "checkmark.shield"
            )
        } description: {
            if let error = viewModel.errorMessage {
                Text(error)
            } else {
                Text("All clear – no incidents to report.")
            }
        }
    }

    // MARK: - Filter Menu

    private var filterMenu: some View {
        Menu {
            Button {
                viewModel.severityFilter = nil
            } label: {
                Label("All", systemImage: viewModel.severityFilter == nil ? "checkmark" : "")
            }
            Divider()
            ForEach(IncidentSeverity.allCases, id: \.self) { severity in
                Button {
                    viewModel.severityFilter = (viewModel.severityFilter == severity) ? nil : severity
                } label: {
                    Label(severity.displayName,
                          systemImage: viewModel.severityFilter == severity ? "checkmark" : severity.systemImage)
                }
            }
        } label: {
            Image(systemName: viewModel.severityFilter == nil
                  ? "line.3.horizontal.decrease.circle"
                  : "line.3.horizontal.decrease.circle.fill")
        }
        .accessibilityLabel("Filter by severity")
    }
}

// MARK: - IncidentRow

private struct IncidentRow: View {
    let incident: Incident

    var body: some View {
        HStack(spacing: 12) {
            SeverityBadge(severity: incident.severity, compact: true)

            VStack(alignment: .leading, spacing: 3) {
                Text(incident.title)
                    .font(.headline)
                    .lineLimit(2)
                HStack {
                    Text(incident.agentName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    TimeAgoText(date: incident.createdAt)
                }
            }

            if incident.status != .open {
                Spacer()
                Text(incident.status.displayName)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color(.tertiarySystemBackground), in: Capsule())
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationStack {
        IncidentListView(viewModel: IncidentListViewModel(webSocket: WebSocketService()))
            .environment(WebSocketService())
    }
}
