// Views/Approvals/ApprovalBannerView.swift
// OpenClaw Work Console
// Sticky banner showing pending approval count, tappable to open the queue.

import SwiftUI

struct ApprovalBannerView: View {
    @Environment(ApprovalViewModel.self) private var approvalViewModel
    @State private var showApprovalQueue = false

    var body: some View {
        Button(action: { showApprovalQueue = true }) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)

                Text(bannerText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.orange)
                    .shadow(color: .orange.opacity(0.4), radius: 6, y: 3)
            )
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityLabel(bannerText)
        .sheet(isPresented: $showApprovalQueue) {
            ApprovalQueueView()
        }
    }

    private var bannerText: String {
        let count = approvalViewModel.pendingCount
        if count == 1 {
            return "1 Approval Pending"
        } else {
            return "\(count) Approvals Pending"
        }
    }
}

// MARK: - Approval Queue (sheet list of pending approvals)

private struct ApprovalQueueView: View {
    @Environment(ApprovalViewModel.self) private var approvalViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedApproval: ApprovalRequest?

    var body: some View {
        NavigationStack {
            Group {
                if approvalViewModel.pendingApprovals.isEmpty {
                    ContentUnavailableView {
                        Label("No Pending Approvals", systemImage: "checkmark.circle.fill")
                    } description: {
                        Text("All approvals have been handled.")
                    }
                } else {
                    List(approvalViewModel.pendingApprovals) { approval in
                        Button(action: { selectedApproval = approval }) {
                            ApprovalQueueRow(approval: approval)
                        }
                        .frame(minHeight: 44)
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Pending Approvals")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .sheet(item: $selectedApproval) { approval in
                NavigationStack {
                    ApprovalDetailView(approval: approval)
                }
            }
        }
    }
}

// MARK: - ApprovalQueueRow

private struct ApprovalQueueRow: View {
    let approval: ApprovalRequest

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: approval.actionType.systemImage)
                .font(.title3)
                .foregroundStyle(.orange)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 3) {
                Text(approval.title)
                    .font(.headline)
                    .lineLimit(1)
                Text(approval.agentName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack {
                    Text(approval.actionType.displayName)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.orange.opacity(0.12), in: Capsule())
                    Spacer()
                    expiryLabel
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var expiryLabel: some View {
        let remaining = approval.timeUntilExpiry
        if remaining <= 0 {
            return Text("Expired")
                .font(.caption2)
                .foregroundStyle(.red)
        } else if remaining < 60 {
            return Text("< 1 min")
                .font(.caption2)
                .foregroundStyle(.red)
        } else {
            let minutes = Int(remaining / 60)
            return Text("\(minutes)m left")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
