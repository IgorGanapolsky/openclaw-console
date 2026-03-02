// ViewModels/TaskDetailViewModel.swift
// OpenClaw Work Console
// @Observable class for task detail with real-time step updates.

import Foundation
import Combine

@Observable
final class TaskDetailViewModel {

    // MARK: State

    private(set) var task: Task?
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?
    private(set) var isSendingMessage: Bool = false
    private(set) var chatMessages: [ChatMessage] = []

    // MARK: Private

    private let agentId: String
    private let taskId: String
    private var webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    // MARK: Init

    init(agentId: String, taskId: String, webSocket: WebSocketService) {
        self.agentId = agentId
        self.taskId = taskId
        self.webSocket = webSocket
        subscribeToEvents()
    }

    // MARK: - Fetch

    @MainActor
    func fetchTask() async {
        isLoading = true
        errorMessage = nil
        do {
            task = try await APIService.shared.fetchTask(agentId: agentId, taskId: taskId)
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Chat

    @MainActor
    func sendMessage(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isSendingMessage = true
        errorMessage = nil

        // Optimistically add user message
        let userMsg = ChatMessage(
            id: UUID().uuidString,
            agentId: agentId,
            taskId: taskId,
            role: .user,
            content: text,
            timestamp: Date()
        )
        chatMessages.append(userMsg)

        do {
            let request = ChatMessageRequest(agentId: agentId, message: text, taskId: taskId)
            let response = try await APIService.shared.sendChatMessage(request)
            chatMessages.append(response)
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
            // Keep the optimistic message for context
        }
        isSendingMessage = false
    }

    // MARK: - WebSocket

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
        case .taskStep(let step):
            guard step.taskId == taskId, var current = task else { return }
            guard !current.steps.contains(where: { $0.id == step.id }) else { return }
            task = Task(
                id: current.id,
                agentId: current.agentId,
                title: current.title,
                description: current.description,
                status: current.status,
                createdAt: current.createdAt,
                updatedAt: current.updatedAt,
                steps: current.steps + [step],
                links: current.links
            )

        case .taskUpdate(let update):
            guard update.id == taskId, let current = task else { return }
            task = Task(
                id: current.id,
                agentId: current.agentId,
                title: current.title,
                description: current.description,
                status: update.status,
                createdAt: current.createdAt,
                updatedAt: update.updatedAt,
                steps: current.steps,
                links: current.links
            )

        case .chatResponse(let message):
            guard message.agentId == agentId, message.taskId == taskId else { return }
            if !chatMessages.contains(where: { $0.id == message.id }) {
                chatMessages.append(message)
            }

        default:
            break
        }
    }
}
