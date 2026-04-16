// Services/WebSocketService.swift
// Handles real-time events from the OpenClaw Gateway.

import Foundation
import Combine

enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected(sessionId: String)
    case error(String)
}

private struct AgentStatusChangePayload: Decodable {
    let agentId: String
    let agentName: String
    let previousStatus: AgentStatus
    let newStatus: AgentStatus

    enum CodingKeys: String, CodingKey {
        case agentId = "agent_id"
        case agentName = "agent_name"
        case previousStatus = "previous_status"
        case newStatus = "new_status"
    }
}

final class WebSocketService: NSObject, ObservableObject {

    private struct ParsedEnvelope {
        let type: String
        let eventType: InboundEventType?
        let payloadData: Data
        let timestamp: Date
    }

    @Published var connectionState: ConnectionState = .disconnected
    @Published var lastEvent: InboundEvent?
    @Published var lastEventTimestamp: Date?
    @Published var lastHeartbeat: GatewayHeartbeatPayload?
    @Published var lastActivityAt: Date?

    private var webSocketTask: URLSessionWebSocketTask?
    private let urlSession: URLSession
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
    private var reconnectAttempt = 0
    private let maxReconnectAttempts = 5

    private let eventSubject = PassthroughSubject<InboundEvent, Never>()
    var eventPublisher: AnyPublisher<InboundEvent, Never> {
        eventSubject.eraseToAnyPublisher()
    }

    // MARK: - Init

    override init() {
        self.urlSession = URLSession(configuration: .default)
        super.init()
    }

    // MARK: - Actions

    /// Convenience: connect using a base URL string (appends /ws path).
    func connect(baseURL: String, token: String) {
        // Build WebSocket URL from the base HTTP URL
        var urlString = baseURL
            .replacingOccurrences(of: "http://", with: "ws://") // allow-http
            .replacingOccurrences(of: "https://", with: "wss://")
        if !urlString.hasSuffix("/ws") {
            urlString += "/ws"
        }
        guard let url = URL(string: urlString) else {
            connectionState = .error("Invalid gateway URL: \(baseURL)")
            return
        }
        connect(url: url, token: token)
    }

    func connect(url: URL, token: String) {
        guard connectionState == .disconnected else { return }

        var request = URLRequest(url: url)
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        webSocketTask = urlSession.webSocketTask(with: request)
        connectionState = .connecting
        webSocketTask?.resume()

        receiveMessage()
    }

    func disconnect() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionState = .disconnected
    }

    /// Subscribe to updates for a list of agent IDs.
    func subscribe(to agentIds: [String]) {
        let event = OutboundEvent(
            type: .subscribe,
            payload: AnyCodable(["agents": agentIds])
        )
        send(event)
    }

    func send(_ event: OutboundEvent) {
        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(event)
            let message = URLSessionWebSocketTask.Message.data(data)
            webSocketTask?.send(message) { error in
                if let error = error {
                    print("WebSocket send error: \(error)")
                }
            }
        } catch {
            print("WebSocket encoding error: \(error)")
        }
    }

    // MARK: - Internal

    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.parseMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.parseMessage(text)
                    }
                @unknown default:
                    break
                }
                self?.receiveMessage()

            case .failure(let error):
                self?.handleFailure(error)
            }
        }
    }

    private func handleFailure(_ error: Error) {
        print("WebSocket failure: \(error)")
        connectionState = .error(error.localizedDescription)

        if reconnectAttempt < maxReconnectAttempts {
            reconnectAttempt += 1
            let delay = pow(2.0, Double(reconnectAttempt))
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                // Logic to reconnect if URL/token are stored
            }
        }
    }

    private func parseMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        guard let envelope = parseEnvelope(data) else { return }

        guard let eventType = envelope.eventType else {
            publish(.unknown(envelope.type), timestamp: envelope.timestamp)
            return
        }

        guard let event = decodeEvent(
            eventType,
            payloadData: envelope.payloadData,
            timestamp: envelope.timestamp
        ) else { return }
        publish(event, timestamp: envelope.timestamp)
    }

    private func parseEnvelope(_ data: Data) -> ParsedEnvelope? {
        let decodedEnvelope = try? decoder.decode(WebSocketEnvelope.self, from: data)
        let timestamp = decodedEnvelope?.timestamp ?? Date()

        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = raw["type"] as? String else { return nil }

        let payloadData = payloadData(from: raw["payload"])
        let eventType = InboundEventType(rawValue: type)
        return ParsedEnvelope(type: type, eventType: eventType, payloadData: payloadData, timestamp: timestamp)
    }

    private func payloadData(from payload: Any?) -> Data {
        guard let payload else { return Data() }
        return (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
    }

    private func decodeEvent(
        _ eventType: InboundEventType,
        payloadData: Data,
        timestamp: Date
    ) -> InboundEvent? {
        switch eventType {
        case .agentUpdate:
            return decode(AgentStatusUpdate.self, from: payloadData).map(InboundEvent.agentUpdate)
        case .taskUpdate:
            return decode(OCTaskUpdate.self, from: payloadData).map(InboundEvent.taskUpdate)
        case .taskStep:
            return decode(TaskStep.self, from: payloadData).map(InboundEvent.taskStep)
        case .incidentNew:
            return decode(Incident.self, from: payloadData).map(InboundEvent.incidentNew)
        case .incidentUpdate:
            return decode(IncidentUpdate.self, from: payloadData).map(InboundEvent.incidentUpdate)
        case .approvalRequest:
            return decode(ApprovalRequest.self, from: payloadData).map(InboundEvent.approvalRequest)
        case .chatResponse:
            return decode(ChatMessage.self, from: payloadData).map(InboundEvent.chatResponse)
        case .agentStatusChange:
            return decodeAgentStatusChange(payloadData)
        case .bridgeSessionNew:
            return decode(BridgeSession.self, from: payloadData).map(InboundEvent.bridgeSessionNew)
        case .bridgeSessionUpdate:
            return decode(BridgeSession.self, from: payloadData).map(InboundEvent.bridgeSessionUpdate)
        case .recurringTaskUpdated:
            return decode(RecurringTask.self, from: payloadData).map(InboundEvent.recurringTaskUpdated)
        case .gitStateChanged:
            return nil
        case .heartbeat:
            return decodeHeartbeat(payloadData, timestamp: timestamp)
        case .connected:
            return decodeConnected(payloadData, timestamp: timestamp)
        case .error:
            return decode(ErrorPayload.self, from: payloadData).map { .error(code: $0.code, message: $0.message) }
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) -> T? {
        try? decoder.decode(type, from: data)
    }

    private func decodeHeartbeat(_ payloadData: Data, timestamp: Date) -> InboundEvent? {
        guard let heartbeat = decode(GatewayHeartbeatPayload.self, from: payloadData) else { return nil }
        DispatchQueue.main.async { [weak self] in
            self?.lastHeartbeat = heartbeat
        }
        return .heartbeat(heartbeat, timestamp: timestamp)
    }

    private func decodeAgentStatusChange(_ payloadData: Data) -> InboundEvent? {
        guard let payload = decode(AgentStatusChangePayload.self, from: payloadData) else { return nil }
        return .agentStatusChange(
            agentId: payload.agentId,
            agentName: payload.agentName,
            previousStatus: payload.previousStatus,
            newStatus: payload.newStatus
        )
    }

    private func decodeConnected(_ payloadData: Data, timestamp: Date) -> InboundEvent? {
        guard let connected = decode(ConnectedPayload.self, from: payloadData) else { return nil }
        reconnectAttempt = 0
        DispatchQueue.main.async { [weak self] in
            self?.connectionState = .connected(sessionId: connected.sessionId)
        }
        return .connected(
            sessionId: connected.sessionId,
            gatewayVersion: connected.gatewayVersion,
            heartbeatIntervalMs: connected.heartbeatIntervalMs,
            timestamp: timestamp
        )
    }

    private func publish(_ event: InboundEvent, timestamp: Date) {
        eventSubject.send(event)
        DispatchQueue.main.async { [weak self] in
            self?.lastEvent = event
            self?.lastEventTimestamp = timestamp
            self?.lastActivityAt = timestamp
        }
    }

}

// ConnectedPayload and ErrorPayload are defined in WebSocketMessage.swift
