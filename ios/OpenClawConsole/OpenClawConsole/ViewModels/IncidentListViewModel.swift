// ViewModels/IncidentListViewModel.swift
// OpenClaw Work Console
// @Observable class managing global incidents across all agents.

import Foundation
import Combine

@Observable
final class IncidentListViewModel {

    // MARK: State

    private(set) var incidents: [Incident] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?
    var severityFilter: IncidentSeverity? = nil

    var filteredIncidents: [Incident] {
        guard let filter = severityFilter else { return incidents }
        return incidents.filter { $0.severity == filter }
    }

    var openCount: Int {
        incidents.filter { $0.status == .open }.count
    }

    var criticalOpenCount: Int {
        incidents.filter { $0.status == .open && $0.severity == .critical }.count
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
    func fetchIncidents() async {
        isLoading = true
        errorMessage = nil
        do {
            incidents = try await APIService.shared.fetchIncidents()
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Agent Actions

    @MainActor
    func triggerAction(_ action: IncidentAction, for incident: Incident) async {
        // Translate incident actions to chat messages to the owning agent
        let message: String
        switch action {
        case .askRootCause:
            message = "What is the root cause of incident '\(incident.title)'?"
        case .proposeFix:
            message = "Please propose a fix for incident '\(incident.title)'."
        case .acknowledge:
            // Acknowledge via status – represented as a chat acknowledgment
            message = "I acknowledge incident '\(incident.title)'."
        }

        do {
            let request = ChatMessageRequest(agentId: incident.agentId, message: message, taskId: nil)
            _ = try await APIService.shared.sendChatMessage(request)

            // Optimistically update status for acknowledge
            if action == .acknowledge {
                if let index = incidents.firstIndex(where: { $0.id == incident.id }) {
                    incidents[index].status = .acknowledged
                }
            }
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
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
        case .incidentNew(let incident):
            if !incidents.contains(where: { $0.id == incident.id }) {
                incidents.insert(incident, at: 0)
                // Schedule notification for critical incidents
                Task {
                    await NotificationService.shared.scheduleCriticalIncidentNotification(for: incident)
                }
            }

        case .incidentUpdate(let update):
            guard let index = incidents.firstIndex(where: { $0.id == update.id }) else { return }
            incidents[index].status = update.status

        default:
            break
        }
    }
}
