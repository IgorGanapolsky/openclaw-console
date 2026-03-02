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
    private var reconnectTask: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?

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
            .replacingOccurrences(of: "http://", // allow-http with: "ws://")

        guard let url = URL(string: "\(wsURLString)/ws?token=\(token)") else {
            connectionState = .failed("Invalid gateway URL")
            return
        }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        urlSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        webSocketTask = urlSession?.webSocketTask(with: url)
        webSocketTask?.resume()

        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }

        startPingLoop()
    }

    // MARK: - Receive Loop

    private func receiveLoop() async {
        while let task = webSocketTask, !Task.isCancelled {
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
                if shouldReconnect && !Task.isCancelled {
                    await handleDisconnect(error: error)
                }
                break
            }
        }
    }

    // MARK: - Parsing

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
            if let obj = try? decoder.decode(TaskUpdate.self, from: payloadData) {
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

    // MARK: - Send

    func send<T: Encodable>(type: OutboundEventType, payload: T) {
        guard let task = webSocketTask else { return }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        struct Envelope<P: Encodable>: Encodable {
            let type: String
            let payload: P
        }

        let envelope = Envelope(type: type.rawValue, payload: payload)
        guard let data = try? encoder.encode(envelope),
              let text = String(data: data, encoding: .utf8) else { return }

        task.send(.string(text)) { _ in }
    }

    // MARK: - Ping

    private func startPingLoop() {
        pingTask?.cancel()
        pingTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30s
                guard !Task.isCancelled else { break }
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

        try? await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))

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
        Task { [weak self] in
            await self?.handleDisconnect(
                error: NSError(domain: "WebSocket",
                               code: closeCode.rawValue,
                               userInfo: [NSLocalizedDescriptionKey: "Connection closed"]))
        }
    }
}
