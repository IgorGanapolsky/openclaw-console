// ViewModels/TaskListViewModel.swift
// OpenClaw Work Console
// @Observable class managing the task list for a specific agent.

import Foundation
import Combine

@Observable
final class TaskListViewModel {

    // MARK: State

    private(set) var tasks: [OCTask] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?
    var statusFilter: TaskStatus? = nil

    var filteredTasks: [OCTask] {
        guard let filter = statusFilter else { return tasks }
        return tasks.filter { $0.status == filter }
    }

    // MARK: Private

    private let agentId: String
    private var webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    // MARK: Init

    init(agentId: String, webSocket: WebSocketService) {
        self.agentId = agentId
        self.webSocket = webSocket
        subscribeToEvents()
    }

    // MARK: - Fetch

    @MainActor
    func fetchTasks() async {
        isLoading = true
        errorMessage = nil
        do {
            tasks = try await APIService.shared.fetchTasks(for: agentId)
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
        case .taskUpdate(let update):
            guard update.agentId == agentId else { return }
            applyTaskUpdate(update)
        case .taskStep(let step):
            guard let index = tasks.firstIndex(where: { $0.id == step.taskId }) else { return }
            var task = tasks[index]
            if !task.steps.contains(where: { $0.id == step.id }) {
                // Rebuild task with new step appended
                tasks[index] = OCTask(
                    id: task.id,
                    agentId: task.agentId,
                    title: task.title,
                    description: task.description,
                    status: task.status,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    steps: task.steps + [step],
                    links: task.links
                )
            }
        default:
            break
        }
    }

    private func applyTaskUpdate(_ update: TaskUpdate) {
        guard let index = tasks.firstIndex(where: { $0.id == update.id }) else { return }
        let old = tasks[index]
        tasks[index] = OCTask(
            id: old.id,
            agentId: old.agentId,
            title: old.title,
            description: old.description,
            status: update.status,
            createdAt: old.createdAt,
            updatedAt: update.updatedAt,
            steps: old.steps,
            links: old.links
        )
    }
}
