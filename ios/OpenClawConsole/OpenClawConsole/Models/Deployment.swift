// Models/Deployment.swift
// OpenClaw Work Console
// Deployment models for IDP self-service deployment functionality

import Foundation

// MARK: - Deployment Status

enum DeploymentStatus: String, Codable, CaseIterable {
    case pending
    case running
    case completed
    case failed
    case cancelled

    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .running: return "Running"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .cancelled: return "Cancelled"
        }
    }

    var systemImage: String {
        switch self {
        case .pending: return "clock"
        case .running: return "gearshape.arrow.triangle.2.circlepath"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.triangle.fill"
        case .cancelled: return "xmark.circle.fill"
        }
    }

    var isComplete: Bool {
        switch self {
        case .completed, .failed, .cancelled: return true
        case .pending, .running: return false
        }
    }
}

// MARK: - Deployment Environment

enum DeploymentEnvironment: String, Codable, CaseIterable {
    case staging
    case production

    var displayName: String {
        switch self {
        case .staging: return "Staging"
        case .production: return "Production"
        }
    }

    var requiresApproval: Bool {
        switch self {
        case .staging: return false
        case .production: return true
        }
    }

    var systemImage: String {
        switch self {
        case .staging: return "testtube.2"
        case .production: return "globe"
        }
    }
}

// MARK: - Deployment Platform

enum DeploymentPlatform: String, Codable, CaseIterable {
    case ios
    case android
    case both

    var displayName: String {
        switch self {
        case .ios: return "iOS"
        case .android: return "Android"
        case .both: return "iOS & Android"
        }
    }

    var systemImage: String {
        switch self {
        case .ios: return "applelogo"
        case .android: return "a.square"
        case .both: return "square.grid.2x2"
        }
    }
}

// MARK: - Deployment Artifact

struct DeploymentArtifact: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let platform: DeploymentPlatform
    let version: String
    let buildNumber: String
    let size: Int64
    let downloadURL: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case platform
        case version
        case buildNumber = "build_number"
        case size
        case downloadURL = "download_url"
        case createdAt = "created_at"
    }

    var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: size, countStyle: .file)
    }

    static func == (lhs: DeploymentArtifact, rhs: DeploymentArtifact) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Deployment Step

struct DeploymentStep: Codable, Identifiable, Hashable {
    let id: String
    let deploymentId: String
    let name: String
    let description: String
    let status: DeploymentStatus
    let startedAt: Date?
    let completedAt: Date?
    let error: String?
    let logs: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case deploymentId = "deployment_id"
        case name
        case description
        case status
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case error
        case logs
    }

    var duration: TimeInterval? {
        guard let startedAt, let completedAt else { return nil }
        return completedAt.timeIntervalSince(startedAt)
    }

    static func == (lhs: DeploymentStep, rhs: DeploymentStep) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Deployment

struct Deployment: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let title: String
    let description: String
    let environment: DeploymentEnvironment
    let platform: DeploymentPlatform
    let status: DeploymentStatus
    let branch: String
    let commit: String
    let commitMessage: String
    let triggeredBy: String
    let createdAt: Date
    let startedAt: Date?
    let completedAt: Date?
    let steps: [DeploymentStep]
    let artifacts: [DeploymentArtifact]
    let approvalId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case title
        case description
        case environment
        case platform
        case status
        case branch
        case commit
        case commitMessage = "commit_message"
        case triggeredBy = "triggered_by"
        case createdAt = "created_at"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case steps
        case artifacts
        case approvalId = "approval_id"
    }

    var duration: TimeInterval? {
        guard let startedAt, let completedAt else { return nil }
        return completedAt.timeIntervalSince(startedAt)
    }

    var shortCommit: String {
        String(commit.prefix(8))
    }

    var requiresApproval: Bool {
        environment.requiresApproval
    }

    var canCancel: Bool {
        status == .pending || status == .running
    }

    static func == (lhs: Deployment, rhs: Deployment) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Deployment Request

struct DeploymentRequest: Codable {
    let environment: DeploymentEnvironment
    let platform: DeploymentPlatform
    let branch: String
    let description: String?

    enum CodingKeys: String, CodingKey {
        case environment
        case platform
        case branch
        case description
    }
}

// MARK: - WebSocket Payloads

struct DeploymentUpdate: Codable {
    let id: String
    let agentId: String
    let status: DeploymentStatus
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case status
        case updatedAt = "updated_at"
    }
}

struct DeploymentStepUpdate: Codable {
    let id: String
    let deploymentId: String
    let status: DeploymentStatus
    let startedAt: Date?
    let completedAt: Date?
    let error: String?
    let logs: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case deploymentId = "deployment_id"
        case status
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case error
        case logs
    }
}