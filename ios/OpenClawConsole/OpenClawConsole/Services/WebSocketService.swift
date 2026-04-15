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

@Observable
final class WebSocketService: NSObject, URLSessionWebSocketTaskDelegate {

    var connectionState: ConnectionState = .disconnected
    var lastEvent: InboundEvent?

    @ObservationIgnored private var webSocketTask: URLSessionWebSocketTask?
    @ObservationIgnored private let urlSession: URLSession
    @ObservationIgnored private let decoder = JSONDecoder()
    @ObservationIgnored private var reconnectAttempt = 0
    @ObservationIgnored private let maxReconnectAttempts = 5

    @ObservationIgnored private let eventSubject = PassthroughSubject<InboundEvent, Never>()
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
        webSocketTask?.delegate = self

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
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                // Logic to reconnect if URL/token are stored
            }
        }
    }

    private func parseMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        // Decode type field first
        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = raw["type"] as? String else { return }

        let payloadData: Data
        if let payload = raw["payload"] {
            payloadData = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
        } else {
            payloadData = Data()
        }

        guard let eventType = InboundEventType(rawValue: type) else {
            eventSubject.send(.unknown(type))
            lastEvent = .unknown(type)
            return
        }

        var event: InboundEvent?

        switch eventType {
        case .agentUpdate:
            if let obj = try? decoder.decode(AgentStatusUpdate.self, from: payloadData) {
                event = .agentUpdate(obj)
            }
        case .taskUpdate:
            if let obj = try? decoder.decode(OCTaskUpdate.self, from: payloadData) {
                event = .taskUpdate(obj)
            }
        case .taskStep:
            if let obj = try? decoder.decode(TaskStep.self, from: payloadData) {
                event = .taskStep(obj)
            }
        case .incidentNew:
            if let obj = try? decoder.decode(Incident.self, from: payloadData) {
                event = .incidentNew(obj)
            }
        case .incidentUpdate:
            if let obj = try? decoder.decode(IncidentUpdate.self, from: payloadData) {
                event = .incidentUpdate(obj)
            }
        case .approvalRequest:
            if let obj = try? decoder.decode(ApprovalRequest.self, from: payloadData) {
                event = .approvalRequest(obj)
            }
        case .chatResponse:
            if let obj = try? decoder.decode(ChatMessage.self, from: payloadData) {
                event = .chatResponse(obj)
            }
        case .bridgeSessionNew:
            if let obj = try? decoder.decode(BridgeSession.self, from: payloadData) {
                event = .bridgeSessionNew(obj)
            }
        case .bridgeSessionUpdate:
            if let obj = try? decoder.decode(BridgeSession.self, from: payloadData) {
                event = .bridgeSessionUpdate(obj)
            }
        case .recurringTaskUpdated:
            if let obj = try? decoder.decode(RecurringTask.self, from: payloadData) {
                event = .recurringTaskUpdated(obj)
            }
        case .gitStateChanged:
            // Handled via other mechanisms or simple notification
            break
        case .connected:
            if let obj = try? decoder.decode(ConnectedPayload.self, from: payloadData) {
                event = .connected(sessionId: obj.sessionId, gatewayVersion: obj.gatewayVersion)
                reconnectAttempt = 0
                connectionState = .connected(sessionId: obj.sessionId)
            }
        case .error:
            if let obj = try? decoder.decode(ErrorPayload.self, from: payloadData) {
                event = .error(code: obj.code, message: obj.message)
            }
        }

        if let event {
            eventSubject.send(event)
            lastEvent = event
        }
    }

    // MARK: - URLSessionWebSocketTaskDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        print("WebSocket opened")
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        print("WebSocket closed")
        connectionState = .disconnected
    }
}

// ConnectedPayload and ErrorPayload are defined in WebSocketMessage.swift
