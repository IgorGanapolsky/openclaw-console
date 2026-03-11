// ViewModels/BridgeListViewModel.swift
// OpenClaw Work Console
// Manages the list of external IDE/Terminal bridge sessions.

import Foundation
import Combine
import Observation

@Observable
final class BridgeListViewModel {
    private(set) var sessions: [BridgeSession] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    init(webSocket: WebSocketService) {
        self.webSocket = webSocket
        setupWebSocketListeners()
    }

    // MARK: - Fetch

    @MainActor
    func fetchBridges() async {
        isLoading = true
        errorMessage = nil
        do {
            sessions = try await APIService.shared.fetchBridges()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
        case .bridgeSessionNew(let session):
            if !sessions.contains(where: { $0.id == session.id }) {
                sessions.append(session)
            }
        case .bridgeSessionUpdate(let session):
            if let index = sessions.firstIndex(where: { $0.id == session.id }) {
                sessions[index] = session
            }
        default:
            break
        }
    }
}
