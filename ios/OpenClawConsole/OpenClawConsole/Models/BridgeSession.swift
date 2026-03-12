// Models/BridgeSession.swift
// OpenClaw Work Console
// Model for agent bridge sessions

import Foundation

struct BridgeSession: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let bridgeType: String
    let status: String
    let createdAt: Date
    let lastActivity: Date?
    let metadata: [String: String]?

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case bridgeType = "bridge_type"
        case status
        case createdAt = "created_at"
        case lastActivity = "last_activity"
        case metadata
    }
}