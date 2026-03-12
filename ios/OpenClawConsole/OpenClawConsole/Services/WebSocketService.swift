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
    @ObservationIgnored private var healthCheckTask: _Concurrency.Task<Void, Never>?

    private var shouldReconnect: Bool = false
    private var lastPongReceived: Date = Date()
    private var connectionHealthy: Bool = true

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
        healthCheckTask?.cancel()
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
        startHealthCheck()
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
        guard let data = text.data(using: .utf8) else { return }

        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = raw["type"] as? String else { return }

        guard let eventType = InboundEventType(rawValue: type) else {
            publish(event: .unknown(type))
            return
        }

        let payloadData = payloadData(from: raw["payload"])
        guard let event = decodeInboundEvent(eventType, payloadData: payloadData) else { return }
        publish(event: event)
    }

    private func payloadData(from payload: Any?) -> Data {
        guard let payload else { return Data() }
        return (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
    }

    private func publish(event: InboundEvent) {
        eventSubject.send(event)
        lastEvent = event
    }

    private func decodeInboundEvent(_ eventType: InboundEventType, payloadData: Data) -> InboundEvent? {
        switch eventType {
        case .agentUpdate:
            return decode(payloadData, as: AgentStatusUpdate.self, map: InboundEvent.agentUpdate)
        case .taskUpdate:
            return decode(payloadData, as: OCTaskUpdate.self, map: InboundEvent.taskUpdate)
        case .taskStep:
            return decode(payloadData, as: TaskStep.self, map: InboundEvent.taskStep)
        case .incidentNew:
            return decode(payloadData, as: Incident.self, map: InboundEvent.incidentNew)
        case .incidentUpdate:
            return decode(payloadData, as: IncidentUpdate.self, map: InboundEvent.incidentUpdate)
        case .approvalRequest:
            return decode(payloadData, as: ApprovalRequest.self, map: InboundEvent.approvalRequest)
        case .chatResponse:
            return decode(payloadData, as: ChatMessage.self, map: InboundEvent.chatResponse)
        case .bridgeSessionNew:
            return decode(payloadData, as: BridgeSession.self, map: InboundEvent.bridgeSessionNew)
        case .bridgeSessionUpdate:
            return decode(payloadData, as: BridgeSession.self, map: InboundEvent.bridgeSessionUpdate)
        case .recurringTaskUpdated:
            return decode(payloadData, as: RecurringTask.self, map: InboundEvent.recurringTaskUpdated)
        case .gitStateChanged:
            return decode(payloadData, as: GitStateUpdatePayload.self) { .gitStateChanged($0.agentId, $0.gitState) }
        case .connected:
            return decode(payloadData, as: ConnectedPayload.self) { [weak self] payload in
                self?.reconnectAttempt = 0
                self?.connectionState = .connected(sessionId: payload.sessionId)
                return .connected(sessionId: payload.sessionId, gatewayVersion: payload.gatewayVersion)
            }
        case .error:
            return decode(payloadData, as: ErrorPayload.self) { .error(code: $0.code, message: $0.message) }
        }
    }

    private func decode<T: Decodable>(_ payloadData: Data, as type: T.Type, map: (T) -> InboundEvent) -> InboundEvent? {
        guard let payload = try? decoder.decode(type, from: payloadData) else { return nil }
        return map(payload)
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

    // MARK: - Ping & Health Check

    private func startPingLoop() {
        pingTask?.cancel()
        pingTask = _Concurrency.Task { [weak self] in
            while let self, !_Concurrency.Task.isCancelled {
                try? await _Concurrency.Task.sleep(nanoseconds: 30_000_000_000) // 30s
                guard !_Concurrency.Task.isCancelled else { break }
                self.webSocketTask?.sendPing { [weak self] error in
                    if error == nil {
                        self?.lastPongReceived = Date()
                    }
                }
            }
        }
    }

    private func startHealthCheck() {
        healthCheckTask?.cancel()
        healthCheckTask = _Concurrency.Task { [weak self] in
            while let self, !_Concurrency.Task.isCancelled {
                try? await _Concurrency.Task.sleep(nanoseconds: 60_000_000_000) // 60s health check
                guard !_Concurrency.Task.isCancelled else { break }
                await self.performHealthCheck()
            }
        }
    }

    @MainActor
    private func performHealthCheck() {
        let now = Date()
        let timeSinceLastPong = now.timeIntervalSince(lastPongReceived)

        // If no pong in 90 seconds, consider connection unhealthy
        if timeSinceLastPong > 90 {
            connectionHealthy = false
            if shouldReconnect && connectionState != .connecting {
                Task {
                    await handleDisconnect(error: NSError(
                        domain: "WebSocket",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "Connection health check failed"]
                    ))
                }
            }
        } else {
            connectionHealthy = true
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
