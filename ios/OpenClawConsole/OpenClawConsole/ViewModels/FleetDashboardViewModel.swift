// ViewModels/FleetDashboardViewModel.swift
// OpenClaw Work Console
// @Observable class aggregating all agent states for the fleet dashboard.

import Foundation
import Combine

@Observable
final class FleetDashboardViewModel {

    // MARK: State

    private(set) var agents: [Agent] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?

    // MARK: Computed Summaries

    var onlineCount: Int { agents.filter { $0.status == .online }.count }
    var offlineCount: Int { agents.filter { $0.status == .offline }.count }
    var busyCount: Int { agents.filter { $0.status == .busy }.count }
    var totalPendingApprovals: Int { agents.reduce(0) { $0 + $1.pendingApprovals } }
    var totalActiveTasks: Int { agents.reduce(0) { $0 + $1.activeTasks } }

    var summaryText: String {
        let online = onlineCount
        let approvals = totalPendingApprovals
        let tasks = totalActiveTasks
        let agentSuffix = online == 1 ? "" : "s"
        let approvalSuffix = approvals == 1 ? "" : "s"
        let taskSuffix = tasks == 1 ? "" : "s"
        return "\(online) agent\(agentSuffix) online, " +
            "\(approvals) pending approval\(approvalSuffix), " +
            "\(tasks) active task\(taskSuffix)"
    }

    /// Agents sorted: those needing attention first (pending approvals desc, then busy, online, offline)
    var sortedAgents: [Agent] {
        agents.sorted { lhs, rhs in
            if lhs.pendingApprovals != rhs.pendingApprovals {
                return lhs.pendingApprovals > rhs.pendingApprovals
            }
            return lhs.status.sortOrder < rhs.status.sortOrder
        }
    }

    // MARK: Private

    @ObservationIgnored private var webSocket: WebSocketService
    @ObservationIgnored private var cancellables = Set<AnyCancellable>()

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
            pendingApprovals: update.pendingApprovals
        )
    }
}

// MARK: - AgentStatus Sort Order

private extension AgentStatus {
    var sortOrder: Int {
        switch self {
        case .busy: return 0
        case .online: return 1
        case .offline: return 2
        }
    }
}
