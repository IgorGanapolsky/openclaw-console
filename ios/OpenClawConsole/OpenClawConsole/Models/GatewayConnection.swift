// Models/GatewayConnection.swift
// OpenClaw Work Console
// Gateway connection configuration (name, baseURL, token)
// Tokens are stored in Keychain; this model persists non-sensitive fields to UserDefaults.

import Foundation

struct GatewayConnection: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var baseURL: String   // e.g. "https://gateway.example.com"

    // token is NOT stored here – it lives in Keychain keyed by id
    // Derived convenience
    var wsURL: String {
        baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://") // allow-http
    }

    var isSecure: Bool {
        baseURL.hasPrefix("https://")
    }

    init(id: String = UUID().uuidString, name: String, baseURL: String) {
        self.id = id
        self.name = name
        self.baseURL = baseURL
    }

    static func == (lhs: GatewayConnection, rhs: GatewayConnection) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Health Check Response

struct HealthResponse: Codable {
    let status: String
    let version: String?
    let gatewayVersion: String?
    let startedAt: Date?
    let checkedAt: Date?
    let uptimeSeconds: Int?
    let websocketClients: Int?
    let lastInboundWsAt: Date?
    let lastOutboundWsAt: Date?
    let approvalPolicyPreset: String?
    let localModel: LocalModelStatus?

    enum CodingKeys: String, CodingKey {
        case status
        case version
        case gatewayVersion = "gateway_version"
        case startedAt = "started_at"
        case checkedAt = "checked_at"
        case uptimeSeconds = "uptime_seconds"
        case websocketClients = "websocket_clients"
        case lastInboundWsAt = "last_inbound_ws_at"
        case lastOutboundWsAt = "last_outbound_ws_at"
        case approvalPolicyPreset = "approval_policy_preset"
        case localModel = "local_model"
    }
}

struct LocalModelStatus: Codable, Hashable {
    let enabled: Bool
    let baseURL: String?
    let model: String?

    enum CodingKeys: String, CodingKey {
        case enabled
        case baseURL = "base_url"
        case model
    }
}

// MARK: - Connection Status (local, not from server)

enum GatewayConnectionStatus {
    case unknown
    case checking
    case connected
    case failed(String)
}
