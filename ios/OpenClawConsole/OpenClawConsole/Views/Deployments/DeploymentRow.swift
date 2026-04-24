// Views/Deployments/DeploymentRow.swift
// OpenClaw Work Console
// Individual deployment list item component

import SwiftUI

struct DeploymentRow: View {
    let deployment: Deployment

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            RoundedRectangle(cornerRadius: 4)
                .fill(deploymentStatusColor(deployment.status))
                .frame(width: 4)
                .frame(height: 60)

            VStack(alignment: .leading, spacing: 6) {
                // Title and status
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(deployment.title)
                            .font(.headline)
                            .lineLimit(1)

                        HStack(spacing: 8) {
                            // Environment badge
                            HStack(spacing: 4) {
                                Image(systemName: deployment.environment.systemImage)
                                    .font(.caption2)
                                Text(deployment.environment.displayName)
                                    .font(.caption2.weight(.medium))
                            }
                            .foregroundStyle(environmentColor(deployment.environment))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(environmentColor(deployment.environment).opacity(0.12), in: Capsule())

                            // Platform badge
                            HStack(spacing: 4) {
                                Image(systemName: deployment.platform.systemImage)
                                    .font(.caption2)
                                Text(deployment.platform.displayName)
                                    .font(.caption2.weight(.medium))
                            }
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.gray.opacity(0.12), in: Capsule())
                        }
                    }

                    Spacer()

                    DeploymentStatusBadge(status: deployment.status)
                }

                // Commit info and time
                HStack {
                    HStack(spacing: 4) {
                        Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                            .font(.caption2)
                        Text(deployment.branch)
                            .font(.caption.weight(.medium))
                        Text("(\(deployment.shortCommit))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    TimeAgoText(date: deployment.createdAt)
                }
            }

            // Progress indicator for running deployments
            if deployment.status == .running {
                VStack {
                    Spacer()
                    ProgressView()
                        .scaleEffect(0.8)
                    Spacer()
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - DeploymentStatusBadge

struct DeploymentStatusBadge: View {
    let status: DeploymentStatus

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: status.systemImage)
                .font(.caption2)
            Text(status.displayName)
                .font(.caption2.weight(.semibold))
        }
        .foregroundStyle(deploymentStatusColor(status))
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(deploymentStatusColor(status).opacity(0.12), in: Capsule())
    }
}

// MARK: - Color helpers

func deploymentStatusColor(_ status: DeploymentStatus) -> Color {
    switch status {
    case .pending: return .blue
    case .running: return .orange
    case .completed: return .green
    case .failed: return .red
    case .cancelled: return .gray
    }
}

func environmentColor(_ environment: DeploymentEnvironment) -> Color {
    switch environment {
    case .staging: return .blue
    case .production: return .red
    }
}

#Preview {
    List {
        DeploymentRow(deployment: .preview)
        DeploymentRow(deployment: .previewRunning)
        DeploymentRow(deployment: .previewFailed)
    }
    .listStyle(.insetGrouped)
}