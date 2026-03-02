// Models/ChatMessage.swift
// OpenClaw Work Console
// ChatMessage model matching protocol.md

import Foundation

// MARK: - Message Role

enum MessageRole: String, Codable {
    case user
    case agent

    var isUser: Bool { self == .user }
}

// MARK: - ChatMessage

struct ChatMessage: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let taskId: String?
    let role: MessageRole
    let content: String
    let timestamp: Date

    enum CodingKeys: String, CodingKey {
        case id
        case agentId = "agent_id"
        case taskId = "task_id"
        case role
        case content
        case timestamp
    }

    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Outbound Chat Request

struct ChatMessageRequest: Codable {
    let agentId: String
    let message: String
    let taskId: String?

    enum CodingKeys: String, CodingKey {
        case agentId = "agent_id"
        case message
        case taskId = "task_id"
    }
}
