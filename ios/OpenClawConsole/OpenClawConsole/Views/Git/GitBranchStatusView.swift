// Views/Git/GitBranchStatusView.swift
// OpenClaw Work Console
// Visual branch status indicator with protection indicators and sync state.

import SwiftUI

struct GitBranchStatusView: View {
    let gitState: GitState?

    var body: some View {
        if let gitState = gitState {
            HStack(spacing: 12) {
                branchInfo(gitState: gitState)
                Spacer()
                statusIndicators(gitState: gitState)
            }
        } else {
            HStack {
                Image(systemName: "minus.circle")
                    .foregroundStyle(.secondary)
                Text("No branch information")
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
    }

    // MARK: - Branch Info

    private func branchInfo(gitState: GitState) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "point.3.filled.connected.trianglepath.dotted")
                .foregroundStyle(.blue)

            VStack(alignment: .leading, spacing: 2) {
                Text(gitState.currentBranch)
                    .font(.subheadline)
                    .fontWeight(.semibold)

                if gitState.protectionEnabled {
                    Label("Protected", systemImage: "lock.shield")
                        .font(.caption2)
                        .foregroundColor(.green)
                        .labelStyle(.compact)
                }
            }
        }
    }

    // MARK: - Status Indicators

    private func statusIndicators(gitState: GitState) -> some View {
        HStack(spacing: 8) {
            // Conflicts indicator
            if gitState.conflictCount > 0 {
                conflictsIndicator(count: gitState.conflictCount)
            }

            // Sync status indicators
            if gitState.aheadBy > 0 || gitState.behindBy > 0 {
                syncIndicators(gitState: gitState)
            }

            // Uncommitted changes indicator
            if gitState.hasUncommittedChanges {
                uncommittedIndicator
            }
        }
    }

    private func conflictsIndicator(count: Int) -> some View {
        HStack(spacing: 2) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
            Text("\(count)")
                .font(.caption2)
                .fontWeight(.semibold)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Color.red.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func syncIndicators(gitState: GitState) -> some View {
        HStack(spacing: 4) {
            if gitState.aheadBy > 0 {
                HStack(spacing: 2) {
                    Image(systemName: "arrow.up")
                        .foregroundColor(.blue)
                    Text("\(gitState.aheadBy)")
                        .font(.caption2)
                        .fontWeight(.semibold)
                }
            }

            if gitState.behindBy > 0 {
                HStack(spacing: 2) {
                    Image(systemName: "arrow.down")
                        .foregroundColor(.orange)
                    Text("\(gitState.behindBy)")
                        .font(.caption2)
                        .fontWeight(.semibold)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private var uncommittedIndicator: some View {
        Image(systemName: "circle.fill")
            .foregroundColor(.orange)
            .font(.caption)
    }
}

// MARK: - Compact Label Style

private struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon
            configuration.title
        }
    }
}

private extension LabelStyle where Self == CompactLabelStyle {
    static var compact: CompactLabelStyle { CompactLabelStyle() }
}

#Preview {
    VStack(spacing: 20) {
        // Clean branch state
        GitBranchStatusView(
            gitState: GitState(
                repository: "test-repo",
                currentBranch: "main",
                hasUncommittedChanges: false,
                aheadBy: 0,
                behindBy: 0,
                lastCommitSha: "abc123",
                lastCommitMessage: "Latest commit",
                lastCommitAuthor: "Developer",
                lastCommitDate: Date(),
                protectionEnabled: true,
                conflictCount: 0
            )
        )
        .padding()
        .background(Color(.systemGroupedBackground))

        // Branch with changes and sync issues
        GitBranchStatusView(
            gitState: GitState(
                repository: "test-repo",
                currentBranch: "feature/complex-branch-name",
                hasUncommittedChanges: true,
                aheadBy: 3,
                behindBy: 2,
                lastCommitSha: "def456",
                lastCommitMessage: "Work in progress",
                lastCommitAuthor: "Developer",
                lastCommitDate: Date(),
                protectionEnabled: false,
                conflictCount: 0
            )
        )
        .padding()
        .background(Color(.systemGroupedBackground))

        // Branch with conflicts
        GitBranchStatusView(
            gitState: GitState(
                repository: "test-repo",
                currentBranch: "feature/merge-conflicts",
                hasUncommittedChanges: true,
                aheadBy: 1,
                behindBy: 1,
                lastCommitSha: "ghi789",
                lastCommitMessage: "Conflicted merge",
                lastCommitAuthor: "Developer",
                lastCommitDate: Date(),
                protectionEnabled: true,
                conflictCount: 4
            )
        )
        .padding()
        .background(Color(.systemGroupedBackground))

        // No git state
        GitBranchStatusView(gitState: nil)
            .padding()
            .background(Color(.systemGroupedBackground))
    }
    .padding()
}
