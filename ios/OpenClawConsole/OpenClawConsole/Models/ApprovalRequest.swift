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
    case askRootCause = "ask_root_cause"
    case proposeFix = "propose_fix"
    case acknowledge
    case gitCommit = "git_commit"
    case gitMerge = "git_merge"
    case gitPush = "git_push"
    case agentSkillInstall = "agent_skill_install"
    case agentRollback = "agent_rollback"

    var displayName: String {
        switch self {
        case .deploy: return "Deploy"
        case .shellCommand: return "Shell Command"
        case .configChange: return "Config Change"
        case .keyRotation: return "Key Rotation"
        case .tradeExecution: return "Trade Execution"
        case .destructive: return "Destructive Action"
        case .askRootCause: return "Root Cause"
        case .proposeFix: return "Propose Fix"
        case .acknowledge: return "Acknowledge"
        case .gitCommit: return "Git Commit"
        case .gitMerge: return "Git Merge"
        case .gitPush: return "Git Push"
        case .agentSkillInstall: return "Install Skill"
        case .agentRollback: return "Agent Rollback"
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
        case .askRootCause: return "questionmark.circle"
        case .proposeFix: return "wrench.and.screwdriver"
        case .acknowledge: return "checkmark.circle"
        case .gitCommit: return "arrow.triangle.branch"
        case .gitMerge: return "arrow.triangle.merge"
        case .gitPush: return "arrow.up.doc"
        case .agentSkillInstall: return "square.and.arrow.down"
        case .agentRollback: return "arrow.uturn.backward"
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

struct GitOperation: Codable, Hashable {
    let operationType: String
    let branchFrom: String?
    let branchTo: String?
    let commitMessage: String?
    let fileChanges: [String]?
    let diffSummary: String?

    enum CodingKeys: String, CodingKey {
        case operationType = "operation_type"
        case branchFrom = "branch_from"
        case branchTo = "branch_to"
        case commitMessage = "commit_message"
        case fileChanges = "file_changes"
        case diffSummary = "diff_summary"
    }
}

struct ApprovalContext: Codable, Hashable {
    let service: String
    let environment: String
    let repository: String
    let riskLevel: RiskLevel
    let gitOperation: GitOperation?

    enum CodingKeys: String, CodingKey {
        case service
        case environment
        case repository
        case riskLevel = "risk_level"
        case gitOperation = "git_operation"
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

// MARK: - Governance

enum AgentPlanStepStatus: String, Codable {
    case pending
    case running
    case done
    case blocked
    case skipped
}

struct AgentPlanStep: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let title: String
    let details: String
    let status: AgentPlanStepStatus
    let owner: String?
    let evidence: [ResourceLink]
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case title
        case details
        case status
        case owner
        case evidence
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct EnvironmentObservation: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let source: String
    let summary: String
    let observedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case source
        case summary
        case observedAt = "observed_at"
    }
}

struct RollbackPoint: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let actionType: ApprovalActionType
    let title: String
    let description: String
    let command: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case actionType = "action_type"
        case title
        case description
        case command
        case createdAt = "created_at"
    }
}

struct GovernanceEvent: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let type: String
    let title: String
    let summary: String
    let createdAt: Date
    let actor: String
    let riskLevel: RiskLevel?
    let approvalId: String?
    let taskId: String?
    let incidentId: String?
    let rollbackPointId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case type
        case title
        case summary
        case createdAt = "created_at"
        case actor
        case riskLevel = "risk_level"
        case approvalId = "approval_id"
        case taskId = "task_id"
        case incidentId = "incident_id"
        case rollbackPointId = "rollback_point_id"
    }
}

struct AgentGovernanceState: Codable, Hashable {
    let agentId: String
    let currentObjective: String?
    let objectiveUpdatedAt: Date?
    let plan: [AgentPlanStep]
    let environment: [EnvironmentObservation]
    let rollbackPoints: [RollbackPoint]
    let events: [GovernanceEvent]

    enum CodingKeys: String, CodingKey {
        case agentId = "agent_id"
        case currentObjective = "current_objective"
        case objectiveUpdatedAt = "objective_updated_at"
        case plan
        case environment
        case rollbackPoints = "rollback_points"
        case events
    }
}
