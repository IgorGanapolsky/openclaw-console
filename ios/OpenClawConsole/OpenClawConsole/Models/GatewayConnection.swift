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
            .replacingOccurrences(of: "http://", // allow-http with: "ws://")
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

    enum CodingKeys: String, CodingKey {
        case status
        case version
        case gatewayVersion = "gateway_version"
    }
}

// MARK: - Connection Status (local, not from server)

enum GatewayConnectionStatus {
    case unknown
    case checking
    case connected
    case failed(String)
}
