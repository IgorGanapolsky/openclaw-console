// Views/Agents/AgentListView.swift
// OpenClaw Work Console
// List of agents with status, search, pull-to-refresh, approval badges.

import SwiftUI

struct AgentListView: View {
    @Bindable var viewModel: AgentListViewModel
    @Environment(WebSocketService.self) private var webSocket

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.agents.isEmpty {
                ProgressView("Loading agents…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.filteredAgents.isEmpty && !viewModel.isLoading {
                emptyState
            } else {
                agentList
            }
        }
        .navigationTitle("Agents")
        .searchable(text: $viewModel.searchQuery, prompt: "Search agents")
        .refreshable {
            await viewModel.fetchAgents()
        }
        .task {
            if viewModel.agents.isEmpty {
                await viewModel.fetchAgents()
            }
        }
        .toolbar {
            ToolbarItem(placement: .status) {
                statusSummary
            }
        }
    }

    // MARK: - Agent List

    private var agentList: some View {
        List(viewModel.filteredAgents) { agent in
            NavigationLink(value: agent) {
                AgentRow(agent: agent)
            }
            .frame(minHeight: 44)
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Agent.self) { agent in
            AgentDetailView(agent: agent)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                viewModel.searchQuery.isEmpty ? "No Agents" : "No Results",
                systemImage: viewModel.searchQuery.isEmpty ? "square.grid.2x2.slash" : "magnifyingglass"
            )
        } description: {
            if viewModel.searchQuery.isEmpty {
                if let error = viewModel.errorMessage {
                    Text(error)
                } else {
                    Text("No agents are registered with this gateway.")
                }
            } else {
                Text("No agents match '\(viewModel.searchQuery)'.")
            }
        }
    }

    // MARK: - Status Summary

    private var statusSummary: some View {
        HStack(spacing: 10) {
            if viewModel.onlineCount > 0 {
                HStack(spacing: 4) {
                    StatusDot(status: .online)
                    Text("\(viewModel.onlineCount)")
                        .font(.caption2.weight(.medium))
                }
            }
            if viewModel.busyCount > 0 {
                HStack(spacing: 4) {
                    StatusDot(status: .busy)
                    Text("\(viewModel.busyCount)")
                        .font(.caption2.weight(.medium))
                }
            }
            if viewModel.offlineCount > 0 {
                HStack(spacing: 4) {
                    StatusDot(status: .offline)
                    Text("\(viewModel.offlineCount)")
                        .font(.caption2.weight(.medium))
                }
            }
        }
    }
}

// MARK: - AgentRow

private struct AgentRow: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 12) {
            StatusDot(status: agent.status, size: 10)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(agent.name)
                        .font(.headline)
                    if !agent.workspace.isEmpty {
                        Text(agent.workspace)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(.tertiarySystemBackground), in: Capsule())
                    }
                }

                Text(agent.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                HStack(spacing: 10) {
                    if agent.activeTasks > 0 {
                        Label("\(agent.activeTasks) task\(agent.activeTasks == 1 ? "" : "s")",
                              systemImage: "checklist")
                            .font(.caption)
                            .foregroundStyle(.blue)
                    }
                    if agent.pendingApprovals > 0 {
                        Label("\(agent.pendingApprovals)",
                              systemImage: "exclamationmark.circle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                    TimeAgoText(date: agent.lastActive)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationStack {
        AgentListView(viewModel: AgentListViewModel(webSocket: WebSocketService()))
            .environment(WebSocketService())
    }
}
