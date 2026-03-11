// Views/Git/GitRepositoryView.swift
// OpenClaw Work Console
// Main Git repository view showing branch status, commit history, and pending changes.

import SwiftUI

struct GitRepositoryView: View {
    let agent: Agent
    @State private var gitViewModel: GitViewModel
    @State private var selectedTab: GitTab = .status

    private enum GitTab: String, CaseIterable {
        case status = "Status"
        case history = "History"
        case changes = "Changes"

        var systemImage: String {
            switch self {
            case .status: return "chart.line.uptrend.xyaxis"
            case .history: return "clock.arrow.circlepath"
            case .changes: return "doc.text.fill"
            }
        }
    }

    init(agent: Agent, webSocket: WebSocketService) {
        self.agent = agent
        self._gitViewModel = State(initialValue: GitViewModel(webSocket: webSocket))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if gitViewModel.gitState == nil {
                    emptyStateView
                } else {
                    gitContentView
                }
            }
            .navigationTitle("Git Repository")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await gitViewModel.loadGitState(for: agent)
            }
            .refreshable {
                await gitViewModel.refreshGitState()
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView(
            "No Git Repository",
            systemImage: "folder.badge.questionmark",
            description: Text("This agent doesn't have an associated Git repository.")
        )
    }

    // MARK: - Git Content

    private var gitContentView: some View {
        VStack(spacing: 0) {
            gitHeaderView
            Divider()
            tabPickerView
            Divider()
            tabContentView
        }
    }

    // MARK: - Header

    private var gitHeaderView: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "folder.fill")
                    .foregroundStyle(.blue)
                Text(gitViewModel.gitState?.repository ?? "Unknown")
                    .font(.headline)
                    .fontWeight(.medium)
                Spacer()
                gitStatusBadge
            }

            GitBranchStatusView(gitState: gitViewModel.gitState)
        }
        .padding()
        .background(Color(.systemGroupedBackground))
    }

    private var gitStatusBadge: some View {
        Text(gitViewModel.statusText)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusBackgroundColor)
            .foregroundColor(statusForegroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var statusBackgroundColor: Color {
        if gitViewModel.hasConflicts {
            return .red.opacity(0.2)
        } else if gitViewModel.hasChanges {
            return .orange.opacity(0.2)
        } else if gitViewModel.needsSync {
            return .blue.opacity(0.2)
        } else {
            return .green.opacity(0.2)
        }
    }

    private var statusForegroundColor: Color {
        if gitViewModel.hasConflicts {
            return .red
        } else if gitViewModel.hasChanges {
            return .orange
        } else if gitViewModel.needsSync {
            return .blue
        } else {
            return .green
        }
    }

    // MARK: - Tab Picker

    private var tabPickerView: some View {
        HStack(spacing: 0) {
            ForEach(GitTab.allCases, id: \.self) { tab in
                tabButton(for: tab)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color(.systemGroupedBackground))
    }

    private func tabButton(for tab: GitTab) -> some View {
        Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 6) {
                Image(systemName: tab.systemImage)
                Text(tab.rawValue)
            }
            .font(.subheadline)
            .fontWeight(.medium)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(selectedTab == tab ? Color.accentColor : Color.clear)
            .foregroundColor(selectedTab == tab ? .white : .primary)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(PlainButtonStyle())
        .frame(maxWidth: .infinity)
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContentView: some View {
        switch selectedTab {
        case .status:
            statusTabView
        case .history:
            historyTabView
        case .changes:
            changesTabView
        }
    }

    // MARK: - Status Tab

    private var statusTabView: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if let gitState = gitViewModel.gitState {
                    lastCommitCard(gitState: gitState)

                    if gitState.aheadBy > 0 || gitState.behindBy > 0 {
                        syncStatusCard(gitState: gitState)
                    }

                    if gitState.conflictCount > 0 {
                        conflictsCard(gitState: gitState)
                    }

                    protectionCard(gitState: gitState)
                }
            }
            .padding()
        }
    }

    private func lastCommitCard(gitState: GitState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Latest Commit", systemImage: "clock.arrow.circlepath")
                .font(.headline)
                .fontWeight(.medium)

            VStack(alignment: .leading, spacing: 4) {
                Text(gitState.lastCommitMessage)
                    .font(.subheadline)
                    .fontWeight(.medium)

                HStack {
                    Text(gitState.lastCommitAuthor)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(gitState.lastCommitSha.prefix(8))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(.systemGray5))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }

                Text(gitState.lastCommitDate, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func syncStatusCard(gitState: GitState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Sync Status", systemImage: "arrow.triangle.2.circlepath")
                .font(.headline)
                .fontWeight(.medium)

            if gitState.aheadBy > 0 && gitState.behindBy > 0 {
                Text("Your branch has \(gitState.aheadBy) commits ahead and \(gitState.behindBy) commits behind the remote.")
            } else if gitState.aheadBy > 0 {
                Text("Your branch is \(gitState.aheadBy) commits ahead of the remote.")
            } else if gitState.behindBy > 0 {
                Text("Your branch is \(gitState.behindBy) commits behind the remote.")
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func conflictsCard(gitState: GitState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Merge Conflicts", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .fontWeight(.medium)
                .foregroundColor(.red)

            Text("There are \(gitState.conflictCount) merge conflicts that need to be resolved.")
                .foregroundColor(.red)
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func protectionCard(gitState: GitState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Branch Protection", systemImage: gitState.protectionEnabled ? "lock.shield.fill" : "lock.open.fill")
                .font(.headline)
                .fontWeight(.medium)
                .foregroundColor(gitState.protectionEnabled ? .green : .orange)

            Text(gitState.protectionEnabled
                 ? "Branch protection rules are active on this branch."
                 : "No branch protection rules are configured.")
                .foregroundColor(gitState.protectionEnabled ? .green : .orange)
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    // MARK: - History Tab

    private var historyTabView: some View {
        List(gitViewModel.commitHistory) { commit in
            CommitRowView(commit: commit)
        }
        .listStyle(PlainListStyle())
    }

    // MARK: - Changes Tab

    private var changesTabView: some View {
        List(gitViewModel.fileChanges) { change in
            FileChangeRowView(change: change)
        }
        .listStyle(PlainListStyle())
    }
}

// MARK: - Supporting Views

private struct CommitRowView: View {
    let commit: GitCommit

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(commit.message)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(2)

            HStack {
                Text(commit.author)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(commit.shortSha)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color(.systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            Text(commit.date, style: .relative)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private struct FileChangeRowView: View {
    let change: GitFileChange

    var body: some View {
        HStack {
            Image(systemName: change.status.symbolName)
                .foregroundStyle(colorForStatus(change.status))
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(change.path)
                    .font(.subheadline)
                    .fontWeight(.medium)

                HStack {
                    if change.additions > 0 {
                        Text("+\(change.additions)")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                    if change.deletions > 0 {
                        Text("-\(change.deletions)")
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }

            Spacer()

            Text(change.status.displayName)
                .font(.caption)
                .fontWeight(.medium)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(colorForStatus(change.status).opacity(0.2))
                .foregroundColor(colorForStatus(change.status))
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .padding(.vertical, 2)
    }

    private func colorForStatus(_ status: GitChangeStatus) -> Color {
        switch status {
        case .added: return .green
        case .modified: return .blue
        case .deleted: return .red
        case .renamed: return .orange
        case .copied: return .purple
        case .untracked: return .gray
        }
    }
}

#Preview {
    let mockAgent = Agent(
        id: "agent-1",
        name: "Web Scraper",
        description: "Scrapes e-commerce sites",
        status: .online,
        workspace: "/tmp/scraper",
        tags: ["web", "data"],
        lastActive: Date(),
        activeTasks: 2,
        pendingApprovals: 1,
        gitState: GitState(
            repository: "github.com/user/web-scraper",
            currentBranch: "feature/new-parser",
            hasUncommittedChanges: true,
            aheadBy: 2,
            behindBy: 1,
            lastCommitSha: "abc123def456",
            lastCommitMessage: "Add new product parser",
            lastCommitAuthor: "Agent",
            lastCommitDate: Date().addingTimeInterval(-3600),
            protectionEnabled: true,
            conflictCount: 0
        )
    )

    // Mock WebSocketService for preview
    let mockWebSocket = WebSocketService()
    return GitRepositoryView(agent: mockAgent, webSocket: mockWebSocket)
}
