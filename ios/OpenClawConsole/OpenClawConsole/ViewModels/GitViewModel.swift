// ViewModels/GitViewModel.swift
// OpenClaw Work Console
// @Observable class managing Git operations and state for agents.

import Foundation
import Observation
import Combine

@Observable
final class GitViewModel {

    // MARK: State

    private(set) var gitState: GitState?
    private(set) var fileChanges: [GitFileChange] = []
    private(set) var commitHistory: [GitCommit] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?

    // MARK: Computed Properties

    var hasChanges: Bool {
        gitState?.hasUncommittedChanges == true || !fileChanges.isEmpty
    }

    var needsSync: Bool {
        guard let state = gitState else { return false }
        return state.aheadBy > 0 || state.behindBy > 0
    }

    var hasConflicts: Bool {
        guard let state = gitState else { return false }
        return state.conflictCount > 0
    }

    var statusText: String {
        guard let state = gitState else { return "No repository" }

        if hasConflicts {
            return "⚠️ \(state.conflictCount) conflicts"
        } else if state.hasUncommittedChanges {
            return "⚡ Uncommitted changes"
        } else if state.aheadBy > 0 && state.behindBy > 0 {
            return "↕️ \(state.aheadBy) ahead, \(state.behindBy) behind"
        } else if state.aheadBy > 0 {
            return "⬆️ \(state.aheadBy) ahead"
        } else if state.behindBy > 0 {
            return "⬇️ \(state.behindBy) behind"
        } else {
            return "✅ Up to date"
        }
    }

    // MARK: Private

    private var webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()
    private var agentId: String?

    // MARK: Init

    init(webSocket: WebSocketService) {
        self.webSocket = webSocket
        subscribeToEvents()
    }

    // MARK: - Public Methods

    @MainActor
    func loadGitState(for agent: Agent) async {
        self.agentId = agent.id
        self.gitState = agent.gitState

        guard gitState != nil else { return }

        isLoading = true
        errorMessage = nil

        do {
            // Fetch detailed file changes and commit history
            async let fileChangesTask = APIService.shared.fetchGitFileChanges(agentId: agent.id)
            async let commitHistoryTask = APIService.shared.fetchGitCommitHistory(agentId: agent.id, limit: 10)

            let (changes, commits) = try await (fileChangesTask, commitHistoryTask)
            self.fileChanges = changes
            self.commitHistory = commits
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
    }

    @MainActor
    func refreshGitState() async {
        guard let agentId = agentId else { return }

        isLoading = true
        errorMessage = nil

        do {
            // Trigger a git status refresh on the agent
            try await APIService.shared.refreshGitStatus(agentId: agentId)
            // The state will be updated via WebSocket events
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
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
        case .agentUpdate(let update):
            if update.id == agentId {
                gitState = update.gitState
            }
        case .gitStateChanged(let agentId, let newState):
            if agentId == self.agentId {
                gitState = newState
            }
        default:
            break
        }
    }
}

// MARK: - Supporting Models

struct GitCommit: Codable, Identifiable, Hashable {
    let id = UUID()
    let sha: String
    let message: String
    let author: String
    let date: Date
    let shortSha: String

    enum CodingKeys: String, CodingKey {
        case sha
        case message
        case author
        case date
        case shortSha = "short_sha"
    }
}

// MARK: - API Extensions (placeholder for implementation)

extension APIService {
    func fetchGitFileChanges(agentId: String) async throws -> [GitFileChange] {
        // TODO: Implement actual API call
        return []
    }

    func fetchGitCommitHistory(agentId: String, limit: Int) async throws -> [GitCommit] {
        // TODO: Implement actual API call
        return []
    }

    func refreshGitStatus(agentId: String) async throws {
        // TODO: Implement actual API call
    }
}
