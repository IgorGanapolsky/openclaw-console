// Models/WebSocketMessage.swift
// OpenClaw Work Console
// WebSocket envelope and typed event definitions matching protocol.md

import Foundation

// MARK: - Raw Envelope

/// All WebSocket messages use this envelope:
/// { "type": "event_name", "payload": { ... }, "timestamp": "ISO8601" }
struct WebSocketEnvelope: Codable {
    let type: String
    let payload: AnyCodable
    let timestamp: Date?
}

// MARK: - AnyCodable helper

/// Wraps any JSON value so we can decode payloads dynamically.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            throw DecodingError.typeMismatch(AnyCodable.self,
                                             DecodingError.Context(codingPath: decoder.codingPath,
                                                                   debugDescription: "Unsupported type"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let dict as [String: Any]:
            let wrapped = dict.mapValues { AnyCodable($0) }
            try container.encode(wrapped)
        case let array as [Any]:
            let wrapped = array.map { AnyCodable($0) }
            try container.encode(wrapped)
        case let string as String:
            try container.encode(string)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let bool as Bool:
            try container.encode(bool)
        case is NSNull:
            try container.encodeNil()
        default:
            throw EncodingError.invalidValue(value,
                                             EncodingError.Context(codingPath: encoder.codingPath,
                                                                   debugDescription: "Unsupported type"))
        }
    }
}

// MARK: - Typed Outbound Events

/// Client → Server event types
enum OutboundEventType: String {
    case subscribe
    case unsubscribe
    case approvalResponse = "approval_response"
    case chatMessage = "chat_message"
}

/// Client → Server message envelope
struct OutboundEvent: Encodable {
    let type: OutboundEventType
    let payload: AnyCodable

    enum CodingKeys: String, CodingKey {
        case type, payload
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type.rawValue, forKey: .type)
        try container.encode(payload, forKey: .payload)
    }
}

struct SubscribePayload: Codable {
    let agents: [String]
}

struct ApprovalResponsePayload: Codable {
    let approvalId: String
    let decision: ApprovalDecision
    let biometricVerified: Bool

    enum CodingKeys: String, CodingKey {
        case approvalId = "approval_id"
        case decision
        case biometricVerified = "biometric_verified"
    }
}

// MARK: - Typed Inbound Events

/// Server → Client event type strings
enum InboundEventType: String {
    case agentUpdate = "agent_update"
    case taskUpdate = "task_update"
    case taskStep = "task_step"
    case incidentNew = "incident_new"
    case incidentUpdate = "incident_update"
    case approvalRequest = "approval_request"
    case chatResponse = "chat_response"
    case bridgeSessionNew = "bridge_session_new"
    case bridgeSessionUpdate = "bridge_session_update"
    case recurringTaskUpdated = "recurring_task_updated"
    case gitStateChanged = "git_state_changed"
    case heartbeat
    case connected
    case error
}

/// Decoded server message with strongly-typed payload
enum InboundEvent {
    case agentUpdate(AgentStatusUpdate)
    case taskUpdate(OCTaskUpdate)
    case taskStep(TaskStep)
    case incidentNew(Incident)
    case incidentUpdate(IncidentUpdate)
    case approvalRequest(ApprovalRequest)
    case chatResponse(ChatMessage)
    case bridgeSessionNew(BridgeSession)
    case bridgeSessionUpdate(BridgeSession)
    case recurringTaskUpdated(RecurringTask)
    case gitStateChanged(String, GitState)
    case heartbeat(GatewayHeartbeatPayload, timestamp: Date?)
    case connected(sessionId: String, gatewayVersion: String, heartbeatIntervalMs: Int, timestamp: Date?)
    case error(code: Int, message: String)
    case unknown(String)
}

// MARK: - Recurring Task

struct Schedule: Codable {
    let type: String
    let value: AnyCodable
}

struct RecurringTask: Codable, Identifiable {
    let id: String
    let agentId: String
    let name: String
    let description: String
    let schedule: Schedule
    let lastRun: String?
    let nextRun: String?
    let status: String
    let errorCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case name
        case description
        case schedule
        case lastRun = "last_run"
        case nextRun = "next_run"
        case status
        case errorCount = "error_count"
    }
}

// MARK: - Bridge Session

struct BridgeSession: Codable, Identifiable {
    let id: String
    let agentId: String
    let type: String // codex, terminal, other
    let title: String
    let cwd: String
    let closed: Bool
    let createdAt: Date
    let updatedAt: Date
    let metadata: [String: AnyCodable]

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case type
        case title
        case cwd
        case closed
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case metadata
    }
}

// Note: GitState is defined in Agent.swift
// MARK: - Connected Payload

struct ConnectedPayload: Codable {
    let sessionId: String
    let gatewayVersion: String
    let heartbeatIntervalMs: Int

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case gatewayVersion = "gateway_version"
        case heartbeatIntervalMs = "heartbeat_interval_ms"
    }
}

struct GatewayHeartbeatPayload: Codable {
    let gatewayVersion: String
    let connectedClients: Int
    let lastInboundAt: Date?
    let lastOutboundAt: Date?
    let uptimeSeconds: Int

    enum CodingKeys: String, CodingKey {
        case gatewayVersion = "gateway_version"
        case connectedClients = "connected_clients"
        case lastInboundAt = "last_inbound_at"
        case lastOutboundAt = "last_outbound_at"
        case uptimeSeconds = "uptime_seconds"
    }
}

// MARK: - Error Payload

struct ErrorPayload: Codable {
    let code: Int
    let message: String
}
