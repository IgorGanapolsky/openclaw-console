// Views/Dashboard/FleetDashboardView.swift
// OpenClaw Work Console
// Fleet dashboard showing all connected agents in a compact, real-time grid.
// Key differentiator: multi-agent overview vs single-agent tools.

import SwiftUI

struct FleetDashboardView: View {
    @Bindable var viewModel: FleetDashboardViewModel
    @Environment(ApprovalViewModel.self) private var approvalViewModel

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.agents.isEmpty {
                ProgressView("Loading fleet...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.agents.isEmpty && !viewModel.isLoading {
                emptyState
            } else {
                dashboardContent
            }
        }
        .navigationTitle("Fleet")
        .refreshable {
            await viewModel.fetchAgents()
        }
        .task {
            if viewModel.agents.isEmpty {
                await viewModel.fetchAgents()
            }
        }
    }

    // MARK: - Dashboard Content

    private var dashboardContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                summaryHeader
                agentGrid
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color(.systemGroupedBackground))
        .navigationDestination(for: Agent.self) { agent in
            AgentDetailView(agent: agent)
        }
    }

    // MARK: - Summary Header

    private var summaryHeader: some View {
        VStack(spacing: 10) {
            HStack(spacing: 16) {
                SummaryPill(
                    value: viewModel.onlineCount,
                    label: "Online",
                    color: .green
                )
                SummaryPill(
                    value: viewModel.totalPendingApprovals,
                    label: "Pending",
                    color: .orange
                )
                SummaryPill(
                    value: viewModel.totalActiveTasks,
                    label: "Tasks",
                    color: .blue
                )
            }

            Text(viewModel.summaryText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Agent Grid

    private var agentGrid: some View {
        let columns = [
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12)
        ]

        return LazyVGrid(columns: columns, spacing: 12) {
            ForEach(viewModel.sortedAgents) { agent in
                NavigationLink(value: agent) {
                    FleetAgentCard(
                        agent: agent,
                        onApprove: {
                            approveFirst(for: agent)
                        }
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Agents", systemImage: "square.grid.2x2.slash")
        } description: {
            if let error = viewModel.errorMessage {
                Text(error)
            } else {
                Text("Connect a gateway to see your fleet.")
            }
        }
    }

    // MARK: - Actions

    private func approveFirst(for agent: Agent) {
        guard let approval = approvalViewModel.pendingApprovals.first(where: {
            $0.agentId == agent.id
        }) else { return }
        _Concurrency.Task {
            try? await approvalViewModel.approve(approval: approval)
        }
    }
}

// MARK: - Fleet Agent Card

private struct FleetAgentCard: View {
    let agent: Agent
    let onApprove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Top row: status dot + name
            HStack(spacing: 6) {
                StatusDot(status: agent.status, size: 10)
                Text(agent.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                if agent.pendingApprovals > 0 {
                    Text("\(agent.pendingApprovals)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.orange, in: Capsule())
                }
            }

            // Task summary
            Text(agent.description)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            // Last activity
            HStack(spacing: 4) {
                TimeAgoText(date: agent.lastActive)
                Spacer()
                if agent.activeTasks > 0 {
                    Label("\(agent.activeTasks)", systemImage: "checklist")
                        .font(.caption2)
                        .foregroundStyle(.blue)
                }
            }

            // Quick actions
            HStack(spacing: 8) {
                if agent.pendingApprovals > 0 {
                    Button {
                        onApprove()
                    } label: {
                        Label("Approve", systemImage: "checkmark.circle.fill")
                            .font(.caption2.weight(.medium))
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .controlSize(.mini)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(borderColor, lineWidth: agent.pendingApprovals > 0 ? 1.5 : 0.5)
        )
    }

    private var borderColor: Color {
        if agent.pendingApprovals > 0 { return .orange.opacity(0.6) }
        return Color(.separator).opacity(0.3)
    }
}

// MARK: - Summary Pill

private struct SummaryPill: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
