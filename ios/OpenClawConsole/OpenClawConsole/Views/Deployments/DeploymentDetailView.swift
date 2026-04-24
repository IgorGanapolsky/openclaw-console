// Views/Deployments/DeploymentDetailView.swift
// OpenClaw Work Console
// Detailed deployment progress view with real-time step updates

import SwiftUI

struct DeploymentDetailView: View {
    let deployment: Deployment
    @Bindable var viewModel: DeploymentListViewModel
    @State private var showingCancelAlert = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // Header
                deploymentHeader

                // Actions
                if deployment.canCancel {
                    actionButtons
                }

                // Artifacts
                if !deployment.artifacts.isEmpty {
                    artifactsSection
                }

                // Steps Timeline
                if !deployment.steps.isEmpty {
                    stepsSection
                }
            }
            .padding()
        }
        .navigationTitle(deployment.title)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Cancel Deployment", isPresented: $showingCancelAlert) {
            Button("Cancel", role: .destructive) {
                Task {
                    await viewModel.cancelDeployment(deployment.id)
                }
            }
            Button("Keep Running", role: .cancel) { }
        } message: {
            Text("Are you sure you want to cancel this deployment? This action cannot be undone.")
        }
    }

    // MARK: - Header

    private var deploymentHeader: some View {
        VStack(spacing: 12) {
            HStack {
                DeploymentStatusBadge(status: deployment.status)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(deployment.environment.displayName)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(environmentColor(deployment.environment))
                    Text(deployment.platform.displayName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                if !deployment.description.isEmpty {
                    Text(deployment.description)
                        .font(.body)
                }

                // Git info
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(deployment.branch)
                            .font(.caption.weight(.medium))
                        Text(deployment.shortCommit)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }

                    Text(deployment.commitMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }

                // Timing info
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Created")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                        TimeAgoText(date: deployment.createdAt)
                    }

                    if let startedAt = deployment.startedAt {
                        Spacer()
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Started")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                            TimeAgoText(date: startedAt)
                        }
                    }

                    if let completedAt = deployment.completedAt {
                        Spacer()
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Completed")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                            TimeAgoText(date: completedAt)
                        }
                    }
                }

                if let duration = deployment.duration {
                    HStack {
                        Image(systemName: "clock")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("Duration: \(formatDuration(duration))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack {
            Button("Cancel Deployment") {
                showingCancelAlert = true
            }
            .buttonStyle(.bordered)
            .tint(.red)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Artifacts Section

    private var artifactsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "archivebox")
                    .font(.headline)
                Text("Artifacts")
                    .font(.headline.weight(.semibold))
                Spacer()
                Text("\(deployment.artifacts.count)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            ForEach(deployment.artifacts) { artifact in
                ArtifactRow(artifact: artifact)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Steps Section

    private var stepsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "list.number")
                    .font(.headline)
                Text("Steps")
                    .font(.headline.weight(.semibold))
                Spacer()
                Text("\(deployment.steps.count)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            ForEach(deployment.steps.sorted(by: { step1, step2 in
                guard let start1 = step1.startedAt, let start2 = step2.startedAt else {
                    return step1.startedAt != nil
                }
                return start1 < start2
            })) { step in
                DeploymentStepRow(step: step, isLast: step.id == deployment.steps.last?.id)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Helper

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        if minutes > 0 {
            return "\(minutes)m \(seconds)s"
        } else {
            return "\(seconds)s"
        }
    }
}

// MARK: - ArtifactRow

struct ArtifactRow: View {
    let artifact: DeploymentArtifact

    var body: some View {
        HStack {
            Image(systemName: "doc.zipper")
                .foregroundStyle(.blue)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(artifact.name)
                    .font(.caption.weight(.medium))
                HStack {
                    Text(artifact.platform.displayName)
                        .font(.caption2)
                    Text("•")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("v\(artifact.version) (\(artifact.buildNumber))")
                        .font(.caption2)
                    Text("•")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(artifact.formattedSize)
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }

            Spacer()

            if let url = artifact.downloadURL {
                Button {
                    if let downloadURL = URL(string: url) {
                        UIApplication.shared.open(downloadURL)
                    }
                } label: {
                    Image(systemName: "arrow.down.circle")
                        .font(.title3)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - DeploymentStepRow

struct DeploymentStepRow: View {
    let step: DeploymentStep
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline indicator
            VStack {
                Circle()
                    .fill(deploymentStatusColor(step.status))
                    .frame(width: 12, height: 12)
                if !isLast {
                    Rectangle()
                        .fill(.separator)
                        .frame(width: 2)
                        .frame(minHeight: 30)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(step.name)
                            .font(.caption.weight(.semibold))
                        Spacer()
                        if let startedAt = step.startedAt {
                            TimeAgoText(date: startedAt)
                        }
                    }

                    Text(step.description)
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let duration = step.duration {
                        Text("Duration: \(formatDuration(duration))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                if let error = step.error {
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))
                }

                if !step.logs.isEmpty {
                    DisclosureGroup("Logs (\(step.logs.count))") {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(step.logs, id: \.self) { log in
                                    Text(log)
                                        .font(.caption2.monospaced())
                                        .foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .frame(maxHeight: 120)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 4))
                    }
                    .font(.caption2)
                }
            }
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        if minutes > 0 {
            return "\(minutes)m \(seconds)s"
        } else {
            return "\(seconds)s"
        }
    }
}

#Preview {
    NavigationStack {
        DeploymentDetailView(
            deployment: .previewWithSteps,
            viewModel: DeploymentListViewModel.preview
        )
    }
}