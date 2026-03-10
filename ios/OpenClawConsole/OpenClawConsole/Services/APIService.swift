// Services/APIService.swift
// OpenClaw Work Console
// HTTP client for OpenClaw gateway REST endpoints.
// Uses async/await with Bearer token auth injection.

import Foundation

// MARK: - OpenClaw Error

enum OpenClawError: LocalizedError {
    case invalidURL
    case noActiveGateway
    case httpError(Int, String?)
    case decodingError(String)
    case networkError(String)
    case serverError(code: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The gateway URL is invalid."
        case .noActiveGateway:
            return "No active gateway is configured."
        case .httpError(let code, let msg):
            return "HTTP \(code): \(msg ?? "Unknown error")"
        case .decodingError(let detail):
            return "Failed to parse server response: \(detail)"
        case .networkError(let msg):
            return "Network error: \(msg)"
        case .serverError(let code, let message):
            return "Server error \(code): \(message)"
        }
    }
}

// MARK: - APIService

final class APIService {

    static let shared = APIService()
    private init() {}

    // Active gateway configuration (set by GatewayManager)
    var activeGateway: GatewayConnection?

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        return URLSession(configuration: config)
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    // MARK: - Generic Request

    private func request<T: Decodable>(
        method: String = "GET",
        path: String,
        body: (any Encodable)? = nil,
        gateway: GatewayConnection? = nil
    ) async throws -> T {
        let gw = gateway ?? activeGateway
        guard let gw else { throw OpenClawError.noActiveGateway }
        guard let token = KeychainService.shared.retrieve(for: gw.id) else {
            throw OpenClawError.httpError(401, "No token available for gateway")
        }

        let urlString = gw.baseURL + path
        guard let url = URL(string: urlString) else {
            throw OpenClawError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw OpenClawError.networkError(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenClawError.networkError("No HTTP response")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            // Try to parse error body
            if let errorPayload = try? decoder.decode(ErrorPayload.self, from: data) {
                throw OpenClawError.serverError(code: errorPayload.code, message: errorPayload.message)
            }
            let body = String(data: data, encoding: .utf8)
            throw OpenClawError.httpError(httpResponse.statusCode, body)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw OpenClawError.decodingError(error.localizedDescription)
        }
    }

    // MARK: - Health Check

    func healthCheck(gateway: GatewayConnection) async throws -> HealthResponse {
        try await request(path: "/api/health", gateway: gateway)
    }

    // MARK: - Agents

    func fetchAgents() async throws -> [Agent] {
        try await request(path: "/api/agents")
    }

    func fetchAgent(id: String) async throws -> Agent {
        try await request(path: "/api/agents/\(id)")
    }

    // MARK: - Tasks

    func fetchTasks(for agentId: String) async throws -> [OCTask] {
        try await request(path: "/api/agents/\(agentId)/tasks")
    }

    func fetchTask(agentId: String, taskId: String) async throws -> OCTask {
        try await request(path: "/api/agents/\(agentId)/tasks/\(taskId)")
    }

    // MARK: - Incidents

    func fetchIncidents() async throws -> [Incident] {
        try await request(path: "/api/incidents")
    }

    // MARK: - Approvals

    func fetchPendingApprovals() async throws -> [ApprovalRequest] {
        try await request(path: "/api/approvals/pending")
    }

    func submitApprovalResponse(_ response: ApprovalResponse) async throws {
        struct EmptyResponse: Decodable {}
        let _: EmptyResponse = try await request(
            method: "POST",
            path: "/api/approvals/\(response.approvalId)/respond",
            body: response
        )
    }

    // MARK: - Bridges

    func fetchBridges() async throws -> [BridgeSession] {
        try await request(path: "/api/bridges")
    }

    // MARK: - Chat

    func sendChatMessage(_ request: ChatMessageRequest) async throws -> ChatMessage {
        try await self.request(
            method: "POST",
            path: "/api/agents/\(request.agentId)/chat",
            body: request
        )
    }
}
