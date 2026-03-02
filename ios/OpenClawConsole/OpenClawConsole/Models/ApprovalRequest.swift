// Models/ApprovalRequest.swift
// OpenClaw Work Console
// ApprovalRequest model with action types matching protocol.md

import Foundation
import SwiftUI

// MARK: - Action Type

enum ApprovalActionType: String, Codable, CaseIterable {
    case deploy
    case shellCommand = "shell_command"
    case configChange = "config_change"
    case keyRotation = "key_rotation"
    case tradeExecution = "trade_execution"
    case destructive

    var displayName: String {
        switch self {
        case .deploy: return "Deploy"
        case .shellCommand: return "Shell Command"
        case .configChange: return "Config Change"
        case .keyRotation: return "Key Rotation"
        case .tradeExecution: return "Trade Execution"
        case .destructive: return "Destructive Action"
        }
    }

    var systemImage: String {
        switch self {
        case .deploy: return "arrow.up.circle"
        case .shellCommand: return "terminal"
        case .configChange: return "slider.horizontal.3"
        case .keyRotation: return "key"
        case .tradeExecution: return "chart.line.uptrend.xyaxis"
        case .destructive: return "trash"
        }
    }
}

// MARK: - Risk Level

enum RiskLevel: String, Codable {
    case high
    case critical

    var displayName: String {
        switch self {
        case .high: return "High"
        case .critical: return "Critical"
        }
    }

    var color: Color {
        switch self {
        case .high: return .orange
        case .critical: return .red
        }
    }
}

// MARK: - Approval Context

struct ApprovalContext: Codable, Hashable {
    let service: String
    let environment: String
    let repository: String
    let riskLevel: RiskLevel

    enum CodingKeys: String, CodingKey {
        case service
        case environment
        case repository
        case riskLevel = "risk_level"
    }
}

// MARK: - Approval Request

struct ApprovalRequest: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let agentName: String
    let actionType: ApprovalActionType
    let title: String
    let description: String
    let command: String
    let context: ApprovalContext
    let createdAt: Date
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case agentName = "agent_name"
        case actionType = "action_type"
        case title
        case description
        case command
        case context
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }

    var isExpired: Bool {
        expiresAt < Date()
    }

    var timeUntilExpiry: TimeInterval {
        expiresAt.timeIntervalSince(Date())
    }

    static func == (lhs: ApprovalRequest, rhs: ApprovalRequest) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Approval Response (outbound)

struct ApprovalResponse: Codable {
    let approvalId: String
    let decision: ApprovalDecision
    let biometricVerified: Bool
    let respondedAt: Date

    enum CodingKeys: String, CodingKey {
        case approvalId = "approval_id"
        case decision
        case biometricVerified = "biometric_verified"
        case respondedAt = "responded_at"
    }
}

// MARK: - Approval Decision

enum ApprovalDecision: String, Codable {
    case approved
    case denied
}
