// ViewModels/DeploymentListViewModel.swift
// OpenClaw Work Console
// @Observable class managing deployment list and trigger functionality

import Foundation
import Observation
import Combine

@Observable
final class DeploymentListViewModel {

    // MARK: State

    private(set) var deployments: [Deployment] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?

    var statusFilter: DeploymentStatus? = nil
    var environmentFilter: DeploymentEnvironment? = nil

    var filteredDeployments: [Deployment] {
        var filtered = deployments

        if let statusFilter {
            filtered = filtered.filter { $0.status == statusFilter }
        }

        if let environmentFilter {
            filtered = filtered.filter { $0.environment == environmentFilter }
        }

        return filtered.sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: Private

    private var webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    // MARK: Init

    init(webSocket: WebSocketService) {
        self.webSocket = webSocket
        subscribeToEvents()
    }

    // MARK: - Fetch

    @MainActor
    func fetchDeployments() async {
        isLoading = true
        errorMessage = nil
        do {
            deployments = try await APIService.shared.fetchDeployments()
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Trigger Deployment

    @MainActor
    func triggerDeployment(request: DeploymentRequest) async {
        do {
            let deployment = try await APIService.shared.triggerDeployment(request: request)

            // Add to list immediately for optimistic updates
            deployments.append(deployment)

            // Send via WebSocket for real-time updates
            let payload = DeploymentTriggerPayload(
                agentId: "", // Will be filled by API service based on context
                request: request
            )
            let event = OutboundEvent(
                type: .deploymentTrigger,
                payload: AnyCodable(payload)
            )

            webSocket.send(event: event)
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - Cancel Deployment

    @MainActor
    func cancelDeployment(_ deploymentId: String) async {
        do {
            try await APIService.shared.cancelDeployment(id: deploymentId)

            // Update local state optimistically
            if let index = deployments.firstIndex(where: { $0.id == deploymentId }) {
                var deployment = deployments[index]
                deployments[index] = Deployment(
                    id: deployment.id,
                    agentId: deployment.agentId,
                    title: deployment.title,
                    description: deployment.description,
                    environment: deployment.environment,
                    platform: deployment.platform,
                    status: .cancelled,
                    branch: deployment.branch,
                    commit: deployment.commit,
                    commitMessage: deployment.commitMessage,
                    triggeredBy: deployment.triggeredBy,
                    createdAt: deployment.createdAt,
                    startedAt: deployment.startedAt,
                    completedAt: Date(),
                    steps: deployment.steps,
                    artifacts: deployment.artifacts,
                    approvalId: deployment.approvalId
                )
            }

            // Send cancellation via WebSocket
            let payload = DeploymentCancelPayload(deploymentId: deploymentId)
            let event = OutboundEvent(
                type: .deploymentCancel,
                payload: AnyCodable(payload)
            )

            webSocket.send(event: event)
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: - WebSocket Events

    private func subscribeToEvents() {
        webSocket.eventPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleEvent(event)
            }
            .store(in: &cancellables)
    }

    private func handleEvent(_ event: InboundEvent) {
        switch event {
        case .deploymentNew(let deployment):
            if !deployments.contains(where: { $0.id == deployment.id }) {
                deployments.append(deployment)
            }

        case .deploymentUpdate(let update):
            if let index = deployments.firstIndex(where: { $0.id == update.id }) {
                var deployment = deployments[index]
                deployments[index] = Deployment(
                    id: deployment.id,
                    agentId: deployment.agentId,
                    title: deployment.title,
                    description: deployment.description,
                    environment: deployment.environment,
                    platform: deployment.platform,
                    status: update.status,
                    branch: deployment.branch,
                    commit: deployment.commit,
                    commitMessage: deployment.commitMessage,
                    triggeredBy: deployment.triggeredBy,
                    createdAt: deployment.createdAt,
                    startedAt: deployment.startedAt,
                    completedAt: update.status.isComplete ? update.updatedAt : deployment.completedAt,
                    steps: deployment.steps,
                    artifacts: deployment.artifacts,
                    approvalId: deployment.approvalId
                )
            }

        case .deploymentStepUpdate(let stepUpdate):
            if let deploymentIndex = deployments.firstIndex(where: { $0.id == stepUpdate.deploymentId }) {
                var deployment = deployments[deploymentIndex]
                if let stepIndex = deployment.steps.firstIndex(where: { $0.id == stepUpdate.id }) {
                    var steps = deployment.steps
                    steps[stepIndex] = DeploymentStep(
                        id: stepUpdate.id,
                        deploymentId: stepUpdate.deploymentId,
                        name: steps[stepIndex].name,
                        description: steps[stepIndex].description,
                        status: stepUpdate.status,
                        startedAt: stepUpdate.startedAt,
                        completedAt: stepUpdate.completedAt,
                        error: stepUpdate.error,
                        logs: stepUpdate.logs
                    )

                    deployments[deploymentIndex] = Deployment(
                        id: deployment.id,
                        agentId: deployment.agentId,
                        title: deployment.title,
                        description: deployment.description,
                        environment: deployment.environment,
                        platform: deployment.platform,
                        status: deployment.status,
                        branch: deployment.branch,
                        commit: deployment.commit,
                        commitMessage: deployment.commitMessage,
                        triggeredBy: deployment.triggeredBy,
                        createdAt: deployment.createdAt,
                        startedAt: deployment.startedAt,
                        completedAt: deployment.completedAt,
                        steps: steps,
                        artifacts: deployment.artifacts,
                        approvalId: deployment.approvalId
                    )
                }
            }

        case .deploymentCompleted(let completedDeployment):
            if let index = deployments.firstIndex(where: { $0.id == completedDeployment.id }) {
                deployments[index] = completedDeployment
            }

        default:
            break
        }
    }
}

// MARK: - Preview Support

extension DeploymentListViewModel {
    static var preview: DeploymentListViewModel {
        let viewModel = DeploymentListViewModel(webSocket: WebSocketService())
        viewModel.deployments = [.preview, .previewRunning, .previewFailed]
        return viewModel
    }
}

// MARK: - Preview Data

extension Deployment {
    static var preview: Deployment {
        Deployment(
            id: "dep_001",
            agentId: "agent_001",
            title: "iOS Production Release v2.1.0",
            description: "Release includes new deployment UI and bug fixes",
            environment: .production,
            platform: .ios,
            status: .completed,
            branch: "main",
            commit: "a1b2c3d4e5f6789012345678901234567890abcd",
            commitMessage: "feat: Add deployment UI extensions for IDP platform",
            triggeredBy: "alice@openclaw.com",
            createdAt: Date().addingTimeInterval(-3600),
            startedAt: Date().addingTimeInterval(-3500),
            completedAt: Date().addingTimeInterval(-3000),
            steps: [.previewCompleted],
            artifacts: [.preview],
            approvalId: "approval_001"
        )
    }

    static var previewRunning: Deployment {
        Deployment(
            id: "dep_002",
            agentId: "agent_001",
            title: "Android Staging Build",
            description: "Testing deployment pipeline changes",
            environment: .staging,
            platform: .android,
            status: .running,
            branch: "develop",
            commit: "b2c3d4e5f6789012345678901234567890abcdef",
            commitMessage: "fix: Resolve deployment step status updates",
            triggeredBy: "bob@openclaw.com",
            createdAt: Date().addingTimeInterval(-1800),
            startedAt: Date().addingTimeInterval(-1700),
            completedAt: nil,
            steps: [.previewRunning],
            artifacts: [],
            approvalId: nil
        )
    }

    static var previewFailed: Deployment {
        Deployment(
            id: "dep_003",
            agentId: "agent_001",
            title: "Cross-platform Build",
            description: "",
            environment: .staging,
            platform: .both,
            status: .failed,
            branch: "feature/new-auth",
            commit: "c3d4e5f6789012345678901234567890abcdefgh",
            commitMessage: "wip: Authentication improvements",
            triggeredBy: "charlie@openclaw.com",
            createdAt: Date().addingTimeInterval(-7200),
            startedAt: Date().addingTimeInterval(-7100),
            completedAt: Date().addingTimeInterval(-6900),
            steps: [.previewFailed],
            artifacts: [],
            approvalId: nil
        )
    }

    static var previewWithSteps: Deployment {
        Deployment(
            id: "dep_004",
            agentId: "agent_001",
            title: "Production Deployment",
            description: "Major release with new features",
            environment: .production,
            platform: .both,
            status: .completed,
            branch: "main",
            commit: "d4e5f6789012345678901234567890abcdefghij",
            commitMessage: "release: Version 3.0.0 with deployment platform",
            triggeredBy: "alice@openclaw.com",
            createdAt: Date().addingTimeInterval(-14400),
            startedAt: Date().addingTimeInterval(-14300),
            completedAt: Date().addingTimeInterval(-13800),
            steps: [.previewCompleted, .previewRunning, .previewFailed],
            artifacts: [.preview, .previewAndroid],
            approvalId: "approval_002"
        )
    }
}

extension DeploymentStep {
    static var previewCompleted: DeploymentStep {
        DeploymentStep(
            id: "step_001",
            deploymentId: "dep_001",
            name: "Build iOS App",
            description: "Compiling iOS application for production",
            status: .completed,
            startedAt: Date().addingTimeInterval(-3400),
            completedAt: Date().addingTimeInterval(-3200),
            error: nil,
            logs: ["Building for iOS...", "Archive successful", "Export complete"]
        )
    }

    static var previewRunning: DeploymentStep {
        DeploymentStep(
            id: "step_002",
            deploymentId: "dep_002",
            name: "Run Tests",
            description: "Executing unit and integration tests",
            status: .running,
            startedAt: Date().addingTimeInterval(-1600),
            completedAt: nil,
            error: nil,
            logs: ["Starting test suite...", "Running unit tests"]
        )
    }

    static var previewFailed: DeploymentStep {
        DeploymentStep(
            id: "step_003",
            deploymentId: "dep_003",
            name: "Deploy to Store",
            description: "Uploading build to app store",
            status: .failed,
            startedAt: Date().addingTimeInterval(-6950),
            completedAt: Date().addingTimeInterval(-6900),
            error: "Authentication failed: Invalid API key",
            logs: ["Uploading to App Store Connect...", "Error: 401 Unauthorized"]
        )
    }
}

extension DeploymentArtifact {
    static var preview: DeploymentArtifact {
        DeploymentArtifact(
            id: "artifact_001",
            name: "OpenClawConsole.ipa",
            platform: .ios,
            version: "2.1.0",
            buildNumber: "147",
            size: 52428800, // 50 MB
            downloadURL: "https://example.com/artifacts/openclaw-console-2.1.0.ipa",
            createdAt: Date().addingTimeInterval(-3000)
        )
    }

    static var previewAndroid: DeploymentArtifact {
        DeploymentArtifact(
            id: "artifact_002",
            name: "OpenClawConsole.apk",
            platform: .android,
            version: "2.1.0",
            buildNumber: "147",
            size: 41943040, // 40 MB
            downloadURL: "https://example.com/artifacts/openclaw-console-2.1.0.apk",
            createdAt: Date().addingTimeInterval(-3000)
        )
    }
}