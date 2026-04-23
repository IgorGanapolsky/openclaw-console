// Views/Agents/AgentListView.swift
// OpenClaw Work Console
// List of agents with status, search, pull-to-refresh, approval badges.

import SwiftUI

struct AgentListView: View {
    @Bindable var viewModel: AgentListViewModel
    @EnvironmentObject private var webSocket: WebSocketService
    @Environment(GatewayManager.self) private var gatewayManager
    @Environment(ApprovalViewModel.self) private var approvalViewModel
    @State private var connectionStatus: GatewayConnectionStatus = .unknown

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
        VStack(spacing: 0) {
            // Connection status banner
            ConnectionStatusBanner(status: connectionStatus)

            // Approval banner
            if approvalViewModel.hasPendingApprovals {
                ApprovalBannerView()
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
            }

            // Agent list
            List(viewModel.filteredAgents) { agent in
                NavigationLink(value: agent) {
                    AgentRow(agent: agent)
                }
            }
            .listStyle(.plain)
            .navigationDestination(for: Agent.self) { agent in
                AgentDetailView(agent: agent)
            }
        }
        .onAppear {
            updateConnectionStatus()
        }
        .onChange(of: gatewayManager.activeGateway) { _, _ in
            updateConnectionStatus()
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
                        .font(.openClawLabelSmall)
                }
            }
            if viewModel.busyCount > 0 {
                HStack(spacing: 4) {
                    StatusDot(status: .busy)
                    Text("\(viewModel.busyCount)")
                        .font(.openClawLabelSmall)
                }
            }
            if viewModel.offlineCount > 0 {
                HStack(spacing: 4) {
                    StatusDot(status: .offline)
                    Text("\(viewModel.offlineCount)")
                        .font(.openClawLabelSmall)
                }
            }
        }
    }

    // MARK: - Helper Methods

    private func updateConnectionStatus() {
        if let gateway = gatewayManager.activeGateway {
            connectionStatus = gatewayManager.connectionStatus(for: gateway)
        } else {
            connectionStatus = .unknown
        }
    }
}

// MARK: - AgentRow

private struct AgentRow: View {
    let agent: Agent

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // Leading: Status dot
                StatusDot(status: agent.status, size: 10)

                // Content: Main info
                VStack(alignment: .leading, spacing: 4) {
                    // Headline: Agent name with status
                    HStack(spacing: 8) {
                        Text(agent.name)
                            .font(.openClawTitleMedium)
                            .fontWeight(.medium)
                    }

                    // Supporting: Description
                    Text(agent.description)
                        .font(.openClawBodyMedium)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    // Supporting: Metadata row with icons
                    HStack(spacing: 12) {
                        // Workspace
                        if !agent.workspace.isEmpty {
                            HStack(spacing: 4) {
                                Image(systemName: "folder")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                                Text(agent.workspace)
                                    .font(.openClawLabelMedium)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        // Active tasks
                        if agent.activeTasks > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark.square")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.blue)
                                Text("\(agent.activeTasks) active")
                                    .font(.openClawLabelMedium)
                                    .foregroundStyle(.blue)
                            }
                        }

                        // Pending approvals
                        if agent.pendingApprovals > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Color.severityWarning)
                                Text("\(agent.pendingApprovals) approval\(agent.pendingApprovals == 1 ? "" : "s")")
                                    .font(.openClawLabelMedium)
                                    .foregroundStyle(Color.severityWarning)
                            }
                        }

                        Spacer()
                    }
                }

                // Trailing: Last active time and chevron
                VStack(alignment: .trailing, spacing: 4) {
                    TimeAgoText(date: agent.lastActive)
                        .font(.openClawLabelSmall)
                        .foregroundStyle(.tertiary)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.quaternary)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)

            // Divider
            Divider()
                .padding(.leading, 44) // Align with content after status dot
        }
        .background(Color(.systemBackground))
        .contentShape(Rectangle()) // Make entire row tappable
    }
}
