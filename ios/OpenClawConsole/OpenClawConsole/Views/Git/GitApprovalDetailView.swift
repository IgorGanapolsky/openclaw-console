// Views/Git/GitApprovalDetailView.swift
// OpenClaw Work Console
// Git-specific approval detail view with diffs, file changes, and commit context.

import SwiftUI

struct GitApprovalDetailView: View {
    let approval: GitApprovalRequest
    @State private var selectedFileIndex: Int = 0
    @State private var showFullDiff: Bool = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    approvalHeader
                    gitContextSection
                    if !approval.fileChanges.isEmpty {
                        fileChangesSection
                        diffSection
                    }
                    riskAssessmentSection
                }
                .padding()
            }
            .navigationTitle("Git Approval")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    approvalButtons
                }
            }
        }
    }

    // MARK: - Approval Header

    private var approvalHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: approval.operation.iconName)
                    .foregroundColor(approval.riskLevel.color)
                    .font(.title2)

                VStack(alignment: .leading, spacing: 2) {
                    Text(approval.operation.displayName)
                        .font(.headline)
                        .fontWeight(.semibold)

                    Text("Requested by \(approval.agentName)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                riskBadge
            }

            if !approval.description.isEmpty {
                Text(approval.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private var riskBadge: some View {
        Text(approval.riskLevel.displayName)
            .font(.caption)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(approval.riskLevel.color.opacity(0.2))
            .foregroundColor(approval.riskLevel.color)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Git Context

    private var gitContextSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Git Context")
                .font(.headline)
                .fontWeight(.semibold)

            VStack(spacing: 8) {
                contextRow(
                    icon: "folder.fill",
                    title: "Repository",
                    value: approval.repository
                )

                contextRow(
                    icon: "point.3.filled.connected.trianglepath.dotted",
                    title: "Branch",
                    value: approval.currentBranch
                )

                if let targetBranch = approval.targetBranch {
                    contextRow(
                        icon: "arrow.branch",
                        title: "Target",
                        value: targetBranch
                    )
                }

                contextRow(
                    icon: "number",
                    title: "Commit",
                    value: approval.commitSha.prefix(8) + "..."
                )
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func contextRow(icon: String, title: String, value: String) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(.blue)
                .frame(width: 20)

            Text(title)
                .fontWeight(.medium)

            Spacer()

            Text(value)
                .foregroundStyle(.secondary)
                .font(.system(.body, design: .monospaced))
        }
    }

    // MARK: - File Changes

    private var fileChangesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("File Changes")
                    .font(.headline)
                    .fontWeight(.semibold)

                Spacer()

                Text("\(approval.fileChanges.count) files")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            LazyVStack(spacing: 4) {
                ForEach(Array(approval.fileChanges.enumerated()), id: \.offset) { index, change in
                    fileChangeRow(change: change, index: index)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func fileChangeRow(change: GitFileChange, index: Int) -> some View {
        Button {
            selectedFileIndex = index
        } label: {
            HStack {
                Image(systemName: change.status.symbolName)
                    .foregroundColor(colorForStatus(change.status))
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 2) {
                    Text(change.path)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                        .multilineTextAlignment(.leading)

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
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.vertical, 4)
        .background(selectedFileIndex == index ? Color.accentColor.opacity(0.1) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Diff Section

    private var diffSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Diff Preview")
                    .font(.headline)
                    .fontWeight(.semibold)

                Spacer()

                Button {
                    showFullDiff.toggle()
                } label: {
                    Text(showFullDiff ? "Collapse" : "Expand")
                        .font(.subheadline)
                        .foregroundColor(.accentColor)
                }
            }

            if selectedFileIndex < approval.fileChanges.count {
                let selectedChange = approval.fileChanges[selectedFileIndex]
                diffPreview(for: selectedChange)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func diffPreview(for change: GitFileChange) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(change.path)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 1) {
                    // Mock diff lines - in real implementation, these would come from the API
                    ForEach(mockDiffLines(for: change), id: \.lineNumber) { line in
                        diffLine(line)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
            }
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .frame(maxHeight: showFullDiff ? .infinity : 200)
        }
    }

    private func diffLine(_ line: DiffLine) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(line.lineNumber)")
                .font(.caption.monospaced())
                .foregroundStyle(.tertiary)
                .frame(minWidth: 30, alignment: .trailing)

            Text(line.prefix)
                .font(.caption.monospaced())
                .foregroundColor(line.type.color)
                .frame(width: 8)

            Text(line.content)
                .font(.caption.monospaced())
                .foregroundColor(line.type == .context ? .primary : line.type.color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Risk Assessment

    private var riskAssessmentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Risk Assessment")
                .font(.headline)
                .fontWeight(.semibold)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(approval.riskFactors, id: \.self) { factor in
                    riskFactorRow(factor)
                }
            }

            if !approval.safeguards.isEmpty {
                Divider()

                Text("Active Safeguards")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                VStack(alignment: .leading, spacing: 4) {
                    ForEach(approval.safeguards, id: \.self) { safeguard in
                        safeguardRow(safeguard)
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(radius: 1)
    }

    private func riskFactorRow(_ factor: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle")
                .foregroundColor(.orange)
                .frame(width: 16)

            Text(factor)
                .font(.subheadline)
        }
    }

    private func safeguardRow(_ safeguard: String) -> some View {
        HStack {
            Image(systemName: "checkmark.shield")
                .foregroundColor(.green)
                .frame(width: 16)

            Text(safeguard)
                .font(.subheadline)
        }
    }

    // MARK: - Approval Buttons

    private var approvalButtons: some View {
        HStack(spacing: 12) {
            Button {
                // Rejection implementation pending
            } label: {
                Text("Reject")
                    .fontWeight(.semibold)
                    .foregroundColor(.red)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            Button {
                // Biometric approval implementation pending auth
            } label: {
                Text("Approve")
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Helper Functions

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

    private func mockDiffLines(for change: GitFileChange) -> [DiffLine] {
        // Mock diff lines for preview - in real implementation, this would come from the approval data
        return [
            DiffLine(lineNumber: 1, type: .context, prefix: " ", content: "import Foundation"),
            DiffLine(lineNumber: 2, type: .context, prefix: " ", content: ""),
            DiffLine(lineNumber: 3, type: .removed, prefix: "-", content: "func oldFunction() {"),
            DiffLine(lineNumber: 4, type: .removed, prefix: "-", content: "    return false"),
            DiffLine(lineNumber: 5, type: .removed, prefix: "-", content: "}"),
            DiffLine(lineNumber: 3, type: .added, prefix: "+", content: "func newFunction() -> Bool {"),
            DiffLine(lineNumber: 4, type: .added, prefix: "+", content: "    return true"),
            DiffLine(lineNumber: 5, type: .added, prefix: "+", content: "}"),
            DiffLine(lineNumber: 6, type: .context, prefix: " ", content: "")
        ]
    }
}

#Preview {
    let mockApproval = GitApprovalRequest(
        id: "approval-1",
        agentName: "CI/CD Agent",
        operation: .push,
        description: "Push feature branch with new authentication system",
        repository: "github.com/company/app",
        currentBranch: "feature/auth-system",
        targetBranch: "main",
        commitSha: "abc123def456789",
        fileChanges: [
            GitFileChange(path: "src/auth/AuthService.swift", status: .added, additions: 120, deletions: 0),
            GitFileChange(path: "src/auth/TokenManager.swift", status: .modified, additions: 45, deletions: 12),
            GitFileChange(path: "tests/AuthTests.swift", status: .added, additions: 89, deletions: 0),
            GitFileChange(path: "docs/README.md", status: .modified, additions: 15, deletions: 3)
        ],
        riskLevel: .medium,
        riskFactors: [
            "Modifies authentication logic",
            "Affects user security",
            "Large number of changes (180+ lines)"
        ],
        safeguards: [
            "All tests passing",
            "Code review completed",
            "No secrets in diff"
        ],
        timestamp: Date()
    )

    return GitApprovalDetailView(approval: mockApproval)
}
