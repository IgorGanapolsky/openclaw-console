// Models/GitApproval.swift
// OpenClaw Work Console
// Git approval data models and supporting types.

import SwiftUI

struct GitApprovalRequest {
    let id: String
    let agentName: String
    let operation: GitOperation
    let description: String
    let repository: String
    let currentBranch: String
    let targetBranch: String?
    let commitSha: String
    let fileChanges: [GitFileChange]
    let riskLevel: RiskLevel
    let riskFactors: [String]
    let safeguards: [String]
    let timestamp: Date

    enum GitOperation {
        case push
        case merge
        case rebase
        case force_push
        case delete_branch
        case create_tag
        case delete_tag

        var displayName: String {
            switch self {
            case .push: return "Push Commits"
            case .merge: return "Merge Branch"
            case .rebase: return "Rebase Branch"
            case .force_push: return "Force Push"
            case .delete_branch: return "Delete Branch"
            case .create_tag: return "Create Tag"
            case .delete_tag: return "Delete Tag"
            }
        }

        var iconName: String {
            switch self {
            case .push: return "arrow.up.circle"
            case .merge: return "arrow.triangle.merge"
            case .rebase: return "arrow.triangle.2.circlepath"
            case .force_push: return "exclamationmark.arrow.up.circle"
            case .delete_branch: return "trash.circle"
            case .create_tag: return "tag.circle"
            case .delete_tag: return "tag.slash.circle"
            }
        }
    }

    enum RiskLevel {
        case low
        case medium
        case high
        case critical

        var displayName: String {
            switch self {
            case .low: return "Low Risk"
            case .medium: return "Medium Risk"
            case .high: return "High Risk"
            case .critical: return "Critical Risk"
            }
        }

        var color: Color {
            switch self {
            case .low: return .green
            case .medium: return .yellow
            case .high: return .orange
            case .critical: return .red
            }
        }
    }
}

struct DiffLine {
    let lineNumber: Int
    let type: DiffType
    let prefix: String
    let content: String

    enum DiffType {
        case added
        case removed
        case context

        var color: Color {
            switch self {
            case .added: return .green
            case .removed: return .red
            case .context: return .primary
            }
        }
    }
}
