// Models/Agent.swift
// OpenClaw Work Console
// Represents an OpenClaw agent as defined in protocol.md

import Foundation

// MARK: - Agent Status

enum AgentStatus: String, Codable, CaseIterable {
    case online
    case offline
    case busy

    var displayName: String {
        switch self {
        case .online: return "Online"
        case .offline: return "Offline"
        case .busy: return "Busy"
        }
    }
}

// MARK: - Agent Model

struct Agent: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let status: AgentStatus
    let workspace: String
    let tags: [String]
    let lastActive: Date
    let activeTasks: Int
    let pendingApprovals: Int

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case status
        case workspace
        case tags
        case lastActive = "last_active"
        case activeTasks = "active_tasks"
        case pendingApprovals = "pending_approvals"
    }

    static func == (lhs: Agent, rhs: Agent) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - AgentStatus Update (WebSocket payload)

struct AgentStatusUpdate: Codable {
    let id: String
    let status: AgentStatus
    let activeTasks: Int
    let pendingApprovals: Int
    let lastActive: Date

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case activeTasks = "active_tasks"
        case pendingApprovals = "pending_approvals"
        case lastActive = "last_active"
    }
}
