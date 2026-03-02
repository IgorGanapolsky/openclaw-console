// Models/Task.swift
// OpenClaw Work Console
// Task, TaskStep, and ResourceLink models matching protocol.md

import Foundation

// MARK: - Task Status

enum TaskStatus: String, Codable, CaseIterable {
    case queued
    case running
    case done
    case failed

    var displayName: String {
        switch self {
        case .queued: return "Queued"
        case .running: return "Running"
        case .done: return "Done"
        case .failed: return "Failed"
        }
    }
}

// MARK: - TaskStep Type

enum TaskStepType: String, Codable, CaseIterable {
    case log
    case toolCall = "tool_call"
    case output
    case error
    case info

    var systemImage: String {
        switch self {
        case .log: return "text.alignleft"
        case .toolCall: return "wrench.and.screwdriver"
        case .output: return "checkmark.circle"
        case .error: return "exclamationmark.circle"
        case .info: return "info.circle"
        }
    }
}

// MARK: - ResourceLink Type

enum ResourceLinkType: String, Codable {
    case githubPR = "github_pr"
    case githubRun = "github_run"
    case dashboard
    case external

    var systemImage: String {
        switch self {
        case .githubPR: return "arrow.triangle.pull"
        case .githubRun: return "play.circle"
        case .dashboard: return "chart.bar"
        case .external: return "link"
        }
    }
}

// MARK: - ResourceLink

struct ResourceLink: Codable, Identifiable, Hashable {
    let label: String
    let url: String
    let type: ResourceLinkType

    // Synthesized id for Identifiable conformance
    var id: String { "\(type.rawValue)-\(url)" }

    static func == (lhs: ResourceLink, rhs: ResourceLink) -> Bool {
        lhs.url == rhs.url
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(url)
    }
}

// MARK: - TaskStep

struct TaskStep: Codable, Identifiable, Hashable {
    let id: String
    let taskId: String
    let type: TaskStepType
    let content: String
    let timestamp: Date
    let metadata: [String: String]?

    enum CodingKeys: String, CodingKey {
        case id
        case taskId = "task_id"
        case type
        case content
        case timestamp
        case metadata
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        taskId = try container.decode(String.self, forKey: .taskId)
        type = try container.decode(TaskStepType.self, forKey: .type)
        content = try container.decode(String.self, forKey: .content)
        timestamp = try container.decode(Date.self, forKey: .timestamp)
        // metadata is freeform; decode as string dict if possible, otherwise nil
        metadata = try container.decodeIfPresent([String: String].self, forKey: .metadata)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(taskId, forKey: .taskId)
        try container.encode(type, forKey: .type)
        try container.encode(content, forKey: .content)
        try container.encode(timestamp, forKey: .timestamp)
        try container.encodeIfPresent(metadata, forKey: .metadata)
    }

    static func == (lhs: TaskStep, rhs: TaskStep) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Task

struct OCTask: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let title: String
    let description: String
    let status: TaskStatus
    let createdAt: Date
    let updatedAt: Date
    let steps: [TaskStep]
    let links: [ResourceLink]

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case title
        case description
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case steps
        case links
    }

    static func == (lhs: OCTask, rhs: OCTask) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - TaskUpdate (WebSocket payload)

struct OCTaskUpdate: Codable {
    let id: String
    let agentId: String
    let status: TaskStatus
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case status
        case updatedAt = "updated_at"
    }
}
