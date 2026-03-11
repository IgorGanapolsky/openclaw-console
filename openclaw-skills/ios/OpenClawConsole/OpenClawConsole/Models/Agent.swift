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

// MARK: - Git State

struct GitState: Codable, Hashable {
    let repository: String
    let currentBranch: String
    let hasUncommittedChanges: Bool
    let aheadBy: Int
    let behindBy: Int
    let lastCommitSha: String
    let lastCommitMessage: String
    let lastCommitAuthor: String
    let lastCommitDate: Date
    let protectionEnabled: Bool
    let conflictCount: Int

    enum CodingKeys: String, CodingKey {
        case repository
        case currentBranch = "current_branch"
        case hasUncommittedChanges = "has_uncommitted_changes"
        case aheadBy = "ahead_by"
        case behindBy = "behind_by"
        case lastCommitSha = "last_commit_sha"
        case lastCommitMessage = "last_commit_message"
        case lastCommitAuthor = "last_commit_author"
        case lastCommitDate = "last_commit_date"
        case protectionEnabled = "protection_enabled"
        case conflictCount = "conflict_count"
    }
}

// MARK: - Git File Change

struct GitFileChange: Codable, Hashable, Identifiable {
    let id = UUID()
    let path: String
    let status: GitChangeStatus
    let additions: Int
    let deletions: Int

    enum CodingKeys: String, CodingKey {
        case path
        case status
        case additions
        case deletions
    }
}

enum GitChangeStatus: String, Codable, CaseIterable {
    case added = "A"
    case modified = "M"
    case deleted = "D"
    case renamed = "R"
    case copied = "C"
    case untracked = "?"

    var displayName: String {
        switch self {
        case .added: return "Added"
        case .modified: return "Modified"
        case .deleted: return "Deleted"
        case .renamed: return "Renamed"
        case .copied: return "Copied"
        case .untracked: return "Untracked"
        }
    }

    var symbolName: String {
        switch self {
        case .added: return "plus.circle.fill"
        case .modified: return "pencil.circle.fill"
        case .deleted: return "minus.circle.fill"
        case .renamed: return "arrow.right.circle.fill"
        case .copied: return "doc.on.doc.fill"
        case .untracked: return "questionmark.circle.fill"
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
    let gitState: GitState?

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
        case gitState = "git_state"
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
    let gitState: GitState?

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case activeTasks = "active_tasks"
        case pendingApprovals = "pending_approvals"
        case lastActive = "last_active"
        case gitState = "git_state"
    }
}
