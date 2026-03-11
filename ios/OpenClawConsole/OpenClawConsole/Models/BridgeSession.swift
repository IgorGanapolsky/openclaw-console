import Foundation

/// Represents an active IDE/Terminal bridge session
struct BridgeSession: Identifiable, Codable {
    let id: String
    let title: String
    let type: String // "codex" or "terminal"
    let agentId: String
    let cwd: String
    let closed: Bool
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, type, agentId, cwd, closed, createdAt
    }
}
