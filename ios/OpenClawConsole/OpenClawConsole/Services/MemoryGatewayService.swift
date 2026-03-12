// Services/MemoryGatewayService.swift
// OpenClaw Work Console
// Memory Gateway Service for persistent context and feedback capture

import Foundation

// MARK: - Memory Context Models

struct MemoryContext: Codable {
    let memories: [MemoryItem]
    let preventionRules: [String]
    let recentSummary: String
}

struct MemoryItem: Codable {
    let context: String
    let outcome: String // "positive" or "negative"
    let tags: [String]
    let timestamp: String
    let confidence: Int
}

struct MemoryStats: Codable {
    let totalMemories: Int
    let positiveMemories: Int
    let negativeMemories: Int
    let recentTrend: String
}

// MARK: - Memory Gateway Service

@Observable
final class MemoryGatewayService {

    // MARK: Properties

    private(set) var isEnabled: Bool = false
    private(set) var lastError: OpenClawError?

    // MARK: Init

    init() {
        // Memory gateway is optional and enabled based on gateway support
    }

    // MARK: - Configuration

    func updateConfiguration(gateway: GatewayConnection?) {
        isEnabled = gateway != nil
    }

    // MARK: - Context Recall

    /// Recall relevant context for a given situation
    func recallContext(
        query: String,
        agentId: String? = nil,
        taskType: String? = nil,
        tags: [String]? = nil
    ) async throws -> MemoryContext {
        guard isEnabled else {
            return MemoryContext(memories: [], preventionRules: [], recentSummary: "Memory gateway not configured")
        }

        var queryParams: [String: String] = ["q": query]

        if let agentId {
            queryParams["agent_id"] = agentId
        }

        if let taskType {
            queryParams["task_type"] = taskType
        }

        if let tags, !tags.isEmpty {
            queryParams["tags"] = tags.joined(separator: ",")
        }

        return try await APIService.shared.request(
            endpoint: "memory/context",
            method: .GET,
            queryParams: queryParams,
            responseType: MemoryContext.self
        )
    }

    // MARK: - Feedback Capture

    /// Capture feedback about an agent action or task outcome
    func captureFeedback(
        signal: String, // "up" or "down"
        context: String,
        agentId: String? = nil,
        taskId: String? = nil,
        incidentId: String? = nil,
        tags: [String]? = nil,
        whatWentWrong: String? = nil,
        whatWorked: String? = nil
    ) async throws -> Bool {
        guard isEnabled else {
            return false
        }

        let body: [String: Any?] = [
            "signal": signal,
            "context": context,
            "agent_id": agentId,
            "task_id": taskId,
            "incident_id": incidentId,
            "tags": tags,
            "what_went_wrong": whatWentWrong,
            "what_worked": whatWorked
        ]

        let compactBody = body.compactMapValues { $0 }

        let response: [String: Any] = try await APIService.shared.request(
            endpoint: "memory/feedback",
            method: .POST,
            body: compactBody,
            responseType: [String: Any].self
        )

        return response["accepted"] as? Bool ?? false
    }

    // MARK: - Statistics

    /// Get memory usage and effectiveness statistics
    func getStats() async throws -> MemoryStats {
        guard isEnabled else {
            return MemoryStats(
                totalMemories: 0,
                positiveMemories: 0,
                negativeMemories: 0,
                recentTrend: "disabled"
            )
        }

        return try await APIService.shared.request(
            endpoint: "memory/stats",
            method: .GET,
            responseType: MemoryStats.self
        )
    }

    // MARK: - Convenience Methods

    /// Auto-capture positive feedback when user approves an action
    func captureApprovalFeedback(
        approval: ApprovalRequest,
        approved: Bool
    ) async {
        do {
            let signal = approved ? "up" : "down"
            let context = approved
                ? "User approved: \(approval.title)"
                : "User rejected: \(approval.title)"

            _ = try await captureFeedback(
                signal: signal,
                context: context,
                agentId: approval.agent_id,
                tags: ["approval", "user-action"],
                whatWorked: approved ? approval.description : nil,
                whatWentWrong: approved ? nil : approval.description
            )
        } catch {
            lastError = error as? OpenClawError ?? .networkError(error)
        }
    }

    /// Get contextual memories for an agent before starting work
    func getAgentContext(for agent: Agent, task: String? = nil) async -> MemoryContext? {
        do {
            let query = task ?? "Agent \(agent.name) starting work"
            return try await recallContext(
                query: query,
                agentId: agent.id,
                tags: ["agent-work"]
            )
        } catch {
            lastError = error as? OpenClawError ?? .networkError(error)
            return nil
        }
    }

    /// Capture feedback when task completes
    func captureTaskCompletion(
        task: OCTask,
        successful: Bool,
        userNotes: String? = nil
    ) async {
        do {
            let signal = successful ? "up" : "down"
            let context = successful
                ? "Task completed successfully: \(task.title)"
                : "Task failed: \(task.title)"

            _ = try await captureFeedback(
                signal: signal,
                context: context,
                agentId: task.agent_id,
                taskId: task.id,
                tags: ["task-completion"],
                whatWorked: successful ? userNotes : nil,
                whatWentWrong: successful ? nil : userNotes
            )
        } catch {
            lastError = error as? OpenClawError ?? .networkError(error)
        }
    }
}

// MARK: - Global Instance

extension MemoryGatewayService {
    static let shared = MemoryGatewayService()
}
