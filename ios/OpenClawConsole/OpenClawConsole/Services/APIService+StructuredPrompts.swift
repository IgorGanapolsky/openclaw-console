//
//  APIService+StructuredPrompts.swift
//  OpenClaw Work Console
//
//  HIGH-ROI: API integration for Multica structured prompts
//

import Foundation

// MARK: - API Response Types

struct CreatePromptResponse: Codable {
    let ok: Bool
    let issue: MulticaIssue?
    let error: String?
}

struct MulticaIssue: Codable {
    let id: String
    let title: String
    let description: String
    let status: String
    let priority: String
    let assignee: String?
    let created_at: String
    let updated_at: String
    let labels: [String]
}

// MARK: - APIService Extension

extension APIService {

    /// Create a new structured prompt via Multica integration
    func createStructuredPrompt(
        gateway: Gateway,
        token: String,
        request: StructuredPromptRequest
    ) async throws -> CreatePromptResponse {
        let url = URL(string: "\(gateway.baseURL)/api/multica/issues")!

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody = [
            "title": request.title,
            "prompt": request.prompt,
            "agent_id": request.agent_id,
            "priority": request.priority,
            "tags": request.tags,
            "schedule": request.schedule as Any
        ]

        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await URLSession.shared.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            if let errorData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorMessage = errorData["error"] as? [String: Any],
               let message = errorMessage["message"] as? String {
                throw APIError.serverError(message)
            }
            throw APIError.serverError("Failed to create structured prompt")
        }

        return try JSONDecoder().decode(CreatePromptResponse.self, from: data)
    }

    /// Fetch structured prompts (simulated by fetching tasks for now)
    func fetchStructuredPrompts(
        gateway: Gateway,
        token: String
    ) async throws -> [StructuredPrompt] {
        // For MVP, we'll fetch tasks and convert them to structured prompts
        // In the future, this should be a dedicated Multica endpoint
        let agents = try await fetchAgents(gateway: gateway, token: token)

        var allPrompts: [StructuredPrompt] = []

        for agent in agents {
            let tasks = try await fetchTasks(for: agent.id, gateway: gateway, token: token)

            let prompts = tasks.compactMap { task -> StructuredPrompt? in
                // Only convert tasks that came from Multica (have multica- prefix)
                guard task.id.hasPrefix("multica-") else { return nil }

                return StructuredPrompt(
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    agent: agent,
                    priority: mapTaskPriorityToPromptPriority(task),
                    status: mapTaskStatusToPromptStatus(task.status),
                    tags: extractTagsFromTask(task),
                    createdAt: ISO8601DateFormatter().date(from: task.created_at) ?? Date(),
                    updatedAt: ISO8601DateFormatter().date(from: task.updated_at) ?? Date(),
                    isScheduled: task.links.contains { $0.label.contains("Scheduled") },
                    schedule: nil
                )
            }

            allPrompts.append(contentsOf: prompts)
        }

        return allPrompts.sorted { $0.updatedAt > $1.updatedAt }
    }

    // MARK: - Helper Methods

    private func mapTaskStatusToPromptStatus(_ taskStatus: String) -> PromptStatus {
        switch taskStatus {
        case "queued": return .todo
        case "running": return .inProgress
        case "done": return .done
        case "failed": return .inReview // Failed tasks need review
        default: return .todo
        }
    }

    private func mapTaskPriorityToPromptPriority(_ task: Task) -> PromptPriority {
        // Extract priority from task description or links
        let description = task.description.lowercased()

        if description.contains("critical") {
            return .critical
        } else if description.contains("high") {
            return .high
        } else if description.contains("low") {
            return .low
        } else {
            return .medium
        }
    }

    private func extractTagsFromTask(_ task: Task) -> [String] {
        // Extract tags from task links or description
        var tags: [String] = []

        // Look for common Multica labels in task description or title
        let text = "\(task.title) \(task.description)".lowercased()

        if text.contains("approval") {
            tags.append("approval-required")
        }
        if text.contains("deploy") {
            tags.append("deployment")
        }
        if text.contains("critical") {
            tags.append("critical")
        }
        if text.contains("mobile") {
            tags.append("mobile-created")
        }

        return tags
    }
}

// MARK: - Error Types

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .unauthorized:
            return "Unauthorized - check your gateway token"
        case .serverError(let message):
            return message
        }
    }
}