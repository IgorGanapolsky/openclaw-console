// ViewModels/LoopListViewModel.swift
// OpenClaw Work Console
// Manages the list of background loops/recurring tasks.

import Foundation
import Combine
import Observation

@Observable
final class LoopListViewModel {
    private(set) var tasks: [RecurringTask] = []
    private(set) var isLoading = false
    var errorMessage: String?

    // Skill generation
    var isGenerating = false
    var generateError: String?
    var generateSuccessMsg: String?

    private let webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    init(webSocket: WebSocketService) {
        self.webSocket = webSocket
        setupWebSocketListeners()
    }

    // MARK: - Fetch

    @MainActor
    func fetchLoops() async {
        isLoading = true
        errorMessage = nil
        do {
            tasks = try await APIService.shared.fetchLoops()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Generate

    @MainActor
    func generateSkill(prompt: String, agentId: String = "agent-ops") async {
        isGenerating = true
        generateError = nil
        generateSuccessMsg = nil
        do {
            let res = try await APIService.shared.generateSkill(prompt: prompt, agentId: agentId)
            generateSuccessMsg = res.message ?? "Skill generated successfully!"
            await fetchLoops() // Refresh list
        } catch {
            generateError = error.localizedDescription
        }
        isGenerating = false
    }

    // MARK: - WebSocket

    private func setupWebSocketListeners() {
        webSocket.eventPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleEvent(event)
            }
            .store(in: &cancellables)
    }

    private func handleEvent(_ event: InboundEvent) {
        switch event {
        case .recurringTaskUpdated(let task):
            if let index = tasks.firstIndex(where: { $0.id == task.id }) {
                tasks[index] = task
            } else {
                tasks.append(task)
            }
        default:
            break
        }
    }
}
