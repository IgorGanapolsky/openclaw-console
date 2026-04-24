// Views/Deployments/DeploymentTriggerView.swift
// OpenClaw Work Console
// Self-service deployment trigger interface with approval flow integration

import SwiftUI

struct DeploymentTriggerView: View {
    @Bindable var viewModel: DeploymentListViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(ApprovalViewModel.self) private var approvalViewModel

    @State private var environment: DeploymentEnvironment = .staging
    @State private var platform: DeploymentPlatform = .both
    @State private var selectedBranch = "main"
    @State private var description = ""
    @State private var availableBranches: [String] = ["main", "develop", "staging", "production"]
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                // Environment Section
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Choose deployment environment")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(.secondary)

                        HStack(spacing: 16) {
                            ForEach(DeploymentEnvironment.allCases, id: \.self) { env in
                                EnvironmentButton(
                                    environment: env,
                                    isSelected: environment == env
                                ) {
                                    environment = env
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                } header: {
                    Label("Environment", systemImage: "globe")
                }

                // Platform Section
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Select platform(s) to deploy")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(.secondary)

                        VStack(spacing: 8) {
                            ForEach(DeploymentPlatform.allCases, id: \.self) { plat in
                                PlatformButton(
                                    platform: plat,
                                    isSelected: platform == plat
                                ) {
                                    platform = plat
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                } header: {
                    Label("Platform", systemImage: "square.grid.2x2")
                }

                // Branch Section
                Section {
                    Picker("Branch", selection: $selectedBranch) {
                        ForEach(availableBranches, id: \.self) { branch in
                            Text(branch).tag(branch)
                        }
                    }
                    .pickerStyle(.menu)
                } header: {
                    Label("Branch", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                } footer: {
                    Text("The git branch to deploy from. Make sure your changes are pushed to this branch.")
                }

                // Description Section
                Section {
                    TextField("Deployment description (optional)", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Label("Description", systemImage: "text.alignleft")
                } footer: {
                    Text("Brief description of what's being deployed.")
                }

                // Warning Section for Production
                if environment == .production {
                    Section {
                        HStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Production Deployment")
                                    .font(.footnote.weight(.semibold))
                                Text("This deployment requires biometric approval and will be live to users.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                // Error Message
                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Trigger Deployment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Deploy") {
                        Task {
                            await triggerDeployment()
                        }
                    }
                    .disabled(isSubmitting || selectedBranch.isEmpty)
                    .fontWeight(.semibold)
                }
            }
        }
        .task {
            await loadBranches()
        }
    }

    // MARK: - Actions

    private func triggerDeployment() async {
        isSubmitting = true
        errorMessage = nil

        let request = DeploymentRequest(
            environment: environment,
            platform: platform,
            branch: selectedBranch,
            description: description.isEmpty ? nil : description
        )

        do {
            if environment.requiresApproval {
                // For production deployments, trigger approval flow first
                await approvalViewModel.requestDeploymentApproval(request: request)
                dismiss()
            } else {
                // For staging, deploy immediately
                await viewModel.triggerDeployment(request: request)
                dismiss()
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }

    private func loadBranches() async {
        // In a real implementation, this would fetch branches from the repository
        await Task.sleep(for: .milliseconds(500))
        availableBranches = ["main", "develop", "staging", "production", "feature/deployment-ui"]
    }
}

// MARK: - Environment Button

struct EnvironmentButton: View {
    let environment: DeploymentEnvironment
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: environment.systemImage)
                    .font(.title2)
                    .foregroundStyle(isSelected ? environmentColor(environment) : .secondary)

                Text(environment.displayName)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(isSelected ? environmentColor(environment) : .secondary)

                if environment.requiresApproval {
                    Image(systemName: "lock.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                isSelected
                    ? environmentColor(environment).opacity(0.1)
                    : Color.clear,
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isSelected ? environmentColor(environment) : .separator,
                        lineWidth: isSelected ? 2 : 1
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Platform Button

struct PlatformButton: View {
    let platform: DeploymentPlatform
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: platform.systemImage)
                    .font(.title3)
                    .foregroundStyle(isSelected ? .primary : .secondary)

                Text(platform.displayName)
                    .font(.body.weight(.medium))
                    .foregroundStyle(isSelected ? .primary : .secondary)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.green)
                }
            }
            .padding()
            .background(
                isSelected
                    ? .primary.opacity(0.1)
                    : Color.clear,
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isSelected ? .primary : .separator,
                        lineWidth: isSelected ? 2 : 1
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Helper Functions

func environmentColor(_ environment: DeploymentEnvironment) -> Color {
    switch environment {
    case .staging:
        return .blue
    case .production:
        return .red
    }
}

#Preview {
    DeploymentTriggerView(viewModel: DeploymentListViewModel.preview)
}