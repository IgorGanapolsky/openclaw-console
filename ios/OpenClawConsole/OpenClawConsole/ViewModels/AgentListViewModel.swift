// ViewModels/AgentListViewModel.swift
// OpenClaw Work Console
// @Observable class managing the agent list with real-time WebSocket updates.

import Foundation
import Combine

@Observable
final class AgentListViewModel {

    // MARK: State

    private(set) var agents: [Agent] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?
    var searchQuery: String = ""

    var filteredAgents: [Agent] {
        if searchQuery.isEmpty {
            return agents
        }
        return agents.filter {
            $0.name.localizedCaseInsensitiveContains(searchQuery) ||
                $0.workspace.localizedCaseInsensitiveContains(searchQuery) ||
                $0.tags.contains(where: { $0.localizedCaseInsensitiveContains(searchQuery) })
        }
    }

    var onlineCount: Int { agents.filter { $0.status == .online }.count }
    var offlineCount: Int { agents.filter { $0.status == .offline }.count }
    var busyCount: Int { agents.filter { $0.status == .busy }.count }

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
    func fetchAgents() async {
        isLoading = true
        errorMessage = nil
        do {
            let fetched = try await APIService.shared.fetchAgents()
            agents = fetched
            // Subscribe to all agent updates
            webSocket.subscribe(to: fetched.map { $0.id })
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
            applyUpdate(update)
        default:
            break
        }
    }

    private func applyUpdate(_ update: AgentStatusUpdate) {
        guard let index = agents.firstIndex(where: { $0.id == update.id }) else { return }
        let old = agents[index]
        agents[index] = Agent(
            id: old.id,
            name: old.name,
            description: old.description,
            status: update.status,
            workspace: old.workspace,
            tags: old.tags,
            lastActive: update.lastActive,
            activeTasks: update.activeTasks,
            pendingApprovals: update.pendingApprovals,
            gitState: update.gitState
        )
    }
}
