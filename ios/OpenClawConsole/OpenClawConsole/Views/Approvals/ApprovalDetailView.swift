// Views/Approvals/ApprovalDetailView.swift
// OpenClaw Work Console
// Full-screen approval with risk banner, command block, expiry, biometric confirmation.

import SwiftUI
import Combine

struct ApprovalDetailView: View {
    let approval: ApprovalRequest
    @Environment(ApprovalViewModel.self) private var approvalViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var timeRemaining: TimeInterval = 0
    @State private var errorMessage: String?
    @State private var showDenyConfirmation = false
    @State private var decided = false

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // MARK: Risk Banner
                riskBanner

                // MARK: Action Type
                actionTypeBadge

                // MARK: Description
                descriptionSection

                // MARK: Command Block
                commandSection

                // MARK: Context Info
                contextSection

                Divider()

                // MARK: Expiry
                expirySection

                // MARK: Error
                if let error = errorMessage {
                    Label(error, systemImage: "xmark.octagon.fill")
                        .font(.callout)
                        .foregroundStyle(.red)
                        .padding()
                        .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }

                // MARK: Actions
                if !decided && !approval.isExpired {
                    actionButtons
                } else if approval.isExpired {
                    Label("This approval has expired.", systemImage: "clock.badge.xmark")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
            }
            .padding(16)
        }
        .navigationTitle("Approval Request")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
        }
        .onReceive(timer) { _ in
            timeRemaining = approval.timeUntilExpiry
        }
        .onAppear {
            timeRemaining = approval.timeUntilExpiry
        }
        .confirmationDialog("Deny Approval", isPresented: $showDenyConfirmation, titleVisibility: .visible) {
            Button("Deny Action", role: .destructive) {
                Swift.Task { await performDeny() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to deny '\(approval.title)'?")
        }
        .overlay {
            if approvalViewModel.isProcessing {
                ZStack {
                    Color.black.opacity(0.3).ignoresSafeArea()
                    ProgressView("Processing…")
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    // MARK: - Risk Banner

    private var riskBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.shield.fill")
                .font(.title2.weight(.semibold))
            VStack(alignment: .leading, spacing: 2) {
                Text(approval.context.riskLevel.displayName + " Risk")
                    .font(.headline)
                Text(approval.agentName + " is requesting authorization")
                    .font(.caption)
                    .opacity(0.9)
            }
            Spacer()
        }
        .foregroundStyle(.white)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(approval.context.riskLevel.color)
        )
    }

    // MARK: - Action Type Badge

    private var actionTypeBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: approval.actionType.systemImage)
                .font(.callout)
            Text(approval.actionType.displayName)
                .font(.callout.weight(.semibold))

            Spacer()
        }
        .foregroundStyle(.orange)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader("Description")
            Text(approval.title)
                .font(.headline)
            Text(approval.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }

    // MARK: - Command Block

    private var commandSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader("Command to Execute")
            ScrollView(.horizontal, showsIndicators: false) {
                Text(approval.command)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(.primary)
                    .padding(12)
                    .textSelection(.enabled)
            }
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    // MARK: - Context

    private var contextSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Context")
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                contextRow("Service", value: approval.context.service)
                contextRow("Environment", value: approval.context.environment)
                contextRow("Repository", value: approval.context.repository)
            }
        }
    }

    private func contextRow(_ label: String, value: String) -> some View {
        GridRow {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 90, alignment: .leading)
            Text(value)
                .font(.caption.weight(.medium))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Expiry

    private var expirySection: some View {
        HStack {
            Image(systemName: timeRemaining < 60 ? "clock.badge.exclamationmark" : "clock")
                .foregroundStyle(timeRemaining < 60 ? .red : .secondary)
            Text(expiryText)
                .font(.subheadline)
                .foregroundStyle(timeRemaining < 60 ? .red : .secondary)
            Spacer()
        }
    }

    private var expiryText: String {
        if timeRemaining <= 0 { return "Expired" }
        let minutes = Int(timeRemaining / 60)
        let seconds = Int(timeRemaining.truncatingRemainder(dividingBy: 60))
        if minutes > 0 {
            return "Expires in \(minutes)m \(seconds)s"
        } else {
            return "Expires in \(seconds)s"
        }
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        VStack(spacing: 10) {
            Button(action: { Swift.Task { await performApprove() } }) {
                Label {
                    Text("Approve")
                        .font(.headline)
                } icon: {
                    Image(systemName: BiometricService.shared.biometricType.systemImage)
                }
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .disabled(approvalViewModel.isProcessing)

            Button(role: .destructive, action: { showDenyConfirmation = true }) {
                Text("Deny")
                    .font(.headline)
                    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.bordered)
            .disabled(approvalViewModel.isProcessing)
        }
    }

    // MARK: - Actions

    private func performApprove() async {
        errorMessage = nil
        do {
            try await approvalViewModel.approve(approval: approval)
            decided = true
            try? await Swift.Task.sleep(nanoseconds: 500_000_000)
            dismiss()
        } catch let error as BiometricError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func performDeny() async {
        errorMessage = nil
        do {
            try await approvalViewModel.deny(approval: approval)
            decided = true
            try? await Swift.Task.sleep(nanoseconds: 300_000_000)
            dismiss()
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - Helper

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
    }
}

#Preview {
    let ws = WebSocketService()
    let vm = ApprovalViewModel(webSocket: ws)
    NavigationStack {
        ApprovalDetailView(
            approval: ApprovalRequest(
                id: "apr-1",
                agentId: "a1",
                agentName: "Deploy Agent",
                actionType: .shellCommand,
                title: "Run database migration",
                description: "Apply pending schema migrations to production PostgreSQL.",
                command: "npm run db:migrate --env=production",
                context: ApprovalContext(
                    service: "api-service",
                    environment: "production",
                    repository: "org/backend",
                    riskLevel: .critical
                ),
                createdAt: Date().addingTimeInterval(-120),
                expiresAt: Date().addingTimeInterval(180)
            )
        )
        .environment(vm)
    }
}
