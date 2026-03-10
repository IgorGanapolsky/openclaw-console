// Services/WebSocketService.swift
// OpenClaw Work Console
// WebSocket client using URLSessionWebSocketTask.
// Features: token auth, exponential backoff reconnect, typed events, keepalive ping.

import Foundation
import Combine

// MARK: - Connection State

enum WebSocketConnectionState: Equatable {
    case disconnected
    case connecting
    case connected(sessionId: String)
    case failed(String)
}

private struct OutboundEnvelope<Payload: Encodable>: Encodable {
    let type: String
    let payload: Payload
}

private struct InboundEnvelope {
    let type: String
    let payloadData: Data
}

// MARK: - WebSocketService

@Observable
final class WebSocketService: NSObject {

    // MARK: Published State

    private(set) var connectionState: WebSocketConnectionState = .disconnected
    private(set) var lastEvent: InboundEvent?

    // MARK: Event Stream

    private let eventSubject = PassthroughSubject<InboundEvent, Never>()
    var eventPublisher: AnyPublisher<InboundEvent, Never> {
        eventSubject.eraseToAnyPublisher()
    }

    // MARK: Private

    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var baseURL: String = ""
    private var token: String = ""

    private var reconnectAttempt: Int = 0
    private let maxBackoffSeconds: Double = 30.0
    @ObservationIgnored private var reconnectTask: _Concurrency.Task<Void, Never>?
    @ObservationIgnored private var pingTask: _Concurrency.Task<Void, Never>?
    @ObservationIgnored private var receiveTask: _Concurrency.Task<Void, Never>?

    private var shouldReconnect: Bool = false

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    // MARK: - Connect

    func connect(baseURL: String, token: String) {
        self.baseURL = baseURL
        self.token = token
        self.shouldReconnect = true
        self.reconnectAttempt = 0
        performConnect()
    }

    func disconnect() {
        shouldReconnect = false
        reconnectTask?.cancel()
        pingTask?.cancel()
        receiveTask?.cancel()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionState = .disconnected
    }

    // MARK: - Internal Connect

    private func performConnect() {
        connectionState = .connecting

        let wsURLString = baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://") // allow-http local-dev-only

        guard let url = URL(string: "\(wsURLString)/ws?token=\(token)") else {
            connectionState = .failed("Invalid gateway URL")
            return
        }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        urlSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        webSocketTask = urlSession?.webSocketTask(with: url)
        webSocketTask?.resume()

        receiveTask = _Concurrency.Task { [weak self] in
            await self?.receiveLoop()
        }

        startPingLoop()
    }

    // MARK: - Receive Loop

    private func receiveLoop() async {
        while let task = webSocketTask, !_Concurrency.Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    parseMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        parseMessage(text)
                    }
                @unknown default:
                    break
                }
            } catch {
                if shouldReconnect && !_Concurrency.Task.isCancelled {
                    await handleDisconnect(error: error)
                }
                break
            }
        }
    }

    // MARK: - Parsing

    private func parseMessage(_ text: String) {
        guard let envelope = parseEnvelope(from: text) else { return }
        guard let eventType = InboundEventType(rawValue: envelope.type) else {
            let unknownEvent = InboundEvent.unknown(envelope.type)
            eventSubject.send(unknownEvent)
            lastEvent = unknownEvent
            return
        }

        guard let event = decodeInboundEvent(eventType, from: envelope.payloadData) else { return }
        eventSubject.send(event)
        lastEvent = event
    }

    private func parseEnvelope(from text: String) -> InboundEnvelope? {
        guard let data = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = raw["type"] as? String else {
            return nil
        }

        let payloadData: Data
        if let payload = raw["payload"] {
            payloadData = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
        } else {
            payloadData = Data()
        }

        return InboundEnvelope(type: type, payloadData: payloadData)
    }

    private func decodeInboundEvent(_ eventType: InboundEventType, from payloadData: Data) -> InboundEvent? {
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
        case .bridgeSessionNew:
            return decode(BridgeSession.self, from: payloadData).map(InboundEvent.bridgeSessionNew)
        case .bridgeSessionUpdate:
            return decode(BridgeSession.self, from: payloadData).map(InboundEvent.bridgeSessionUpdate)
        case .connected:
            return makeConnectedEvent(from: payloadData)
        case .error:
            return decode(ErrorPayload.self, from: payloadData).map { payload in
                .error(code: payload.code, message: payload.message)
            }
        }
    }

    private func decode<Payload: Decodable>(_ payloadType: Payload.Type, from payloadData: Data) -> Payload? {
        try? decoder.decode(payloadType, from: payloadData)
    }

    private func makeConnectedEvent(from payloadData: Data) -> InboundEvent? {
        guard let payload = decode(ConnectedPayload.self, from: payloadData) else {
            return nil
        }

        reconnectAttempt = 0
        connectionState = .connected(sessionId: payload.sessionId)
        return .connected(sessionId: payload.sessionId, gatewayVersion: payload.gatewayVersion)
    }

    // MARK: - Send

    func send<T: Encodable>(type: OutboundEventType, payload: T) {
        guard let task = webSocketTask else { return }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let envelope = OutboundEnvelope(type: type.rawValue, payload: payload)
        guard let data = try? encoder.encode(envelope),
              let text = String(data: data, encoding: .utf8) else { return }

        task.send(.string(text)) { _ in }
    }

    // MARK: - Ping

    private func startPingLoop() {
        pingTask?.cancel()
        pingTask = _Concurrency.Task { [weak self] in
            while let self, !_Concurrency.Task.isCancelled {
                try? await _Concurrency.Task.sleep(nanoseconds: 30_000_000_000) // 30s
                guard !_Concurrency.Task.isCancelled else { break }
                self.webSocketTask?.sendPing { _ in }
            }
        }
    }

    // MARK: - Reconnect

    private func handleDisconnect(error: Error) async {
        guard shouldReconnect else { return }

        connectionState = .failed(error.localizedDescription)

        let backoff = min(pow(2.0, Double(reconnectAttempt)), maxBackoffSeconds)
        reconnectAttempt += 1

        try? await _Concurrency.Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))

        guard shouldReconnect else { return }
        performConnect()
    }

    // MARK: - Subscribe helpers

    func subscribe(to agentIds: [String]) {
        send(type: .subscribe, payload: SubscribePayload(agents: agentIds))
    }

    func unsubscribe(from agentIds: [String]) {
        send(type: .unsubscribe, payload: SubscribePayload(agents: agentIds))
    }
}

// MARK: - URLSessionWebSocketDelegate

extension WebSocketService: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        // Connection confirmed at protocol level; actual app-level confirmation
        // comes via the `connected` event from the server.
    }

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                    reason: Data?) {
        guard shouldReconnect else { return }
        _Concurrency.Task { [weak self] in
            await self?.handleDisconnect(
                error: NSError(domain: "WebSocket",
                               code: closeCode.rawValue,
                               userInfo: [NSLocalizedDescriptionKey: "Connection closed"]))
        }
    }
}
