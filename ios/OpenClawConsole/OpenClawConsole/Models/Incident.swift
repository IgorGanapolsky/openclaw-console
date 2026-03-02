// Models/Incident.swift
// OpenClaw Work Console
// Incident model with severity enum matching protocol.md

import Foundation
import SwiftUI

// MARK: - Incident Severity

enum IncidentSeverity: String, Codable, CaseIterable {
    case critical
    case warning
    case info

    var displayName: String {
        switch self {
        case .critical: return "Critical"
        case .warning: return "Warning"
        case .info: return "Info"
        }
    }

    var systemImage: String {
        switch self {
        case .critical: return "exclamationmark.triangle.fill"
        case .warning: return "exclamationmark.triangle"
        case .info: return "info.circle"
        }
    }

    var color: Color {
        switch self {
        case .critical: return .red
        case .warning: return .orange
        case .info: return .blue
        }
    }
}

// MARK: - Incident Status

enum IncidentStatus: String, Codable, CaseIterable {
    case open
    case acknowledged
    case resolved

    var displayName: String {
        switch self {
        case .open: return "Open"
        case .acknowledged: return "Acknowledged"
        case .resolved: return "Resolved"
        }
    }
}

// MARK: - Incident Action

enum IncidentAction: String, Codable, CaseIterable {
    case askRootCause = "ask_root_cause"
    case proposeFix = "propose_fix"
    case acknowledge

    var displayName: String {
        switch self {
        case .askRootCause: return "Ask Root Cause"
        case .proposeFix: return "Propose Fix"
        case .acknowledge: return "Acknowledge"
        }
    }

    var systemImage: String {
        switch self {
        case .askRootCause: return "magnifyingglass"
        case .proposeFix: return "wrench"
        case .acknowledge: return "checkmark.circle"
        }
    }
}

// MARK: - Incident Model

struct Incident: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let agentName: String
    let severity: IncidentSeverity
    let title: String
    let description: String
    var status: IncidentStatus
    let createdAt: Date
    let updatedAt: Date
    let actions: [IncidentAction]

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case agentName = "agent_name"
        case severity
        case title
        case description
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case actions
    }

    static func == (lhs: Incident, rhs: Incident) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - IncidentUpdate (WebSocket payload)

struct IncidentUpdate: Codable {
    let id: String
    let status: IncidentStatus
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case updatedAt = "updated_at"
    }
}
