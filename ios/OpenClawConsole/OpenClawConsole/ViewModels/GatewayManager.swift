// ViewModels/GatewayManager.swift
// OpenClaw Work Console
// @Observable class managing gateway connections.
// Non-sensitive fields persisted to UserDefaults; tokens in Keychain.

import Foundation
import Combine

struct GatewaySetupImport: Equatable {
    let name: String
    let baseURL: String
    let token: String
}

private extension String {
    func trimmingTrailingSlashes() -> String {
        var value = self
        while value.last == "/" {
            value.removeLast()
        }
        return value
    }
}

enum GatewaySetupImportError: LocalizedError, Equatable {
    case invalidLink
    case invalidRoute
    case missingField(String)
    case invalidBaseURL

    var errorDescription: String? {
        switch self {
        case .invalidLink:
            return "Enter a valid setup link."
        case .invalidRoute:
            return "The setup link must use the connect route."
        case .missingField(let field):
            return "The setup link is missing a \(field)."
        case .invalidBaseURL:
            return "The setup link contains an invalid gateway URL."
        }
    }
}

enum GatewaySetupLinkParser {
    private static let allowedSchemes = Set([
        "openclaw-console",
        "openclaw",
        "openclawconsole",
        "https",
        "http"
    ])

    static func normalizedGatewayBaseURL(_ rawValue: String) -> String? {
        let cleanedBaseURL = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingTrailingSlashes()

        guard let gatewayComponents = URLComponents(string: cleanedBaseURL),
              let gatewayScheme = gatewayComponents.scheme?.lowercased(),
              gatewayScheme == "https" || gatewayScheme == "http",
              gatewayComponents.host?.isEmpty == false,
              gatewayComponents.queryItems?.isEmpty ?? true,
              gatewayComponents.fragment == nil else {
            return nil
        }

        return cleanedBaseURL
    }

    static func parse(_ rawValue: String) throws -> GatewaySetupImport {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              allowedSchemes.contains(scheme),
              let queryItems = components.queryItems,
              !queryItems.isEmpty else {
            throw GatewaySetupImportError.invalidLink
        }

        guard connectRoute(from: components) == "connect" else {
            throw GatewaySetupImportError.invalidRoute
        }

        let name = queryValue(for: ["name", "gatewayName", "gateway_name"], in: queryItems)
        let baseURL = queryValue(for: ["url", "baseURL", "baseUrl", "gatewayUrl"], in: queryItems)
        let token = queryValue(for: ["token", "gatewayToken", "gateway_token"], in: queryItems)

        guard let name, !name.isEmpty else {
            throw GatewaySetupImportError.missingField("name")
        }
        guard let baseURL, !baseURL.isEmpty else {
            throw GatewaySetupImportError.missingField("gateway URL")
        }
        guard let token, !token.isEmpty else {
            throw GatewaySetupImportError.missingField("token")
        }

        guard let cleanedBaseURL = normalizedGatewayBaseURL(baseURL) else {
            throw GatewaySetupImportError.invalidBaseURL
        }

        return GatewaySetupImport(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            baseURL: cleanedBaseURL,
            token: token.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    private static func queryValue(for keys: [String], in queryItems: [URLQueryItem]) -> String? {
        for key in keys {
            if let rawValue = queryItems.first(where: { $0.name == key })?.value {
                let normalized = rawValue
                    .replacingOccurrences(of: "+", with: " ")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !normalized.isEmpty {
                    return normalized
                }
            }
        }
        return nil
    }

    private static func connectRoute(from components: URLComponents) -> String? {
        let pathSegments = components.path
            .split(separator: "/")
            .map(String.init)

        return (pathSegments.last ?? components.host)?.lowercased()
    }
}

// MARK: - GatewayManager

@Observable
final class GatewayManager {

    // MARK: State

    private(set) var gateways: [GatewayConnection] = []
    var activeGatewayId: String? {
        didSet {
            persistActiveId()
            updateAPIService()
        }
    }
    var activeGateway: GatewayConnection? {
        gateways.first { $0.id == activeGatewayId }
    }

    var isConfigured: Bool { activeGateway != nil }

    // Connection status per gateway id
    private(set) var connectionStatuses: [String: GatewayConnectionStatus] = [:]

    // MARK: Private

    private let gatewaysKey = "saved_gateways"
    private let activeIdKey = "active_gateway_id"

    // MARK: Init

    init() {
        load()
        updateAPIService()
    }

    // MARK: - Persistence

    private func load() {
        if let data = UserDefaults.standard.data(forKey: gatewaysKey),
           let decoded = try? JSONDecoder().decode([GatewayConnection].self, from: data) {
            gateways = decoded
        }
        activeGatewayId = UserDefaults.standard.string(forKey: activeIdKey)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(gateways) {
            UserDefaults.standard.set(data, forKey: gatewaysKey)
        }
    }

    private func persistActiveId() {
        UserDefaults.standard.set(activeGatewayId, forKey: activeIdKey)
    }

    private func updateAPIService() {
        APIService.shared.activeGateway = activeGateway
    }

    // MARK: - CRUD

    func add(name: String, baseURL: String, token: String) throws {
        let cleaned = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingTrailingSlashes()

        let gateway = GatewayConnection(name: name, baseURL: cleaned)
        try KeychainService.shared.save(token: token, for: gateway.id)
        gateways.append(gateway)
        persist()

        // Auto-select if first gateway
        if gateways.count == 1 {
            activeGatewayId = gateway.id
        }
    }

    func update(gateway: GatewayConnection, name: String, baseURL: String, token: String?) throws {
        guard let index = gateways.firstIndex(where: { $0.id == gateway.id }) else { return }
        let cleaned = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingTrailingSlashes()

        gateways[index] = GatewayConnection(id: gateway.id, name: name, baseURL: cleaned)
        if let token, !token.isEmpty {
            try KeychainService.shared.save(token: token, for: gateway.id)
        }
        persist()
        updateAPIService()
    }

    func delete(gateway: GatewayConnection) {
        try? KeychainService.shared.delete(for: gateway.id)
        gateways.removeAll { $0.id == gateway.id }
        persist()
        if activeGatewayId == gateway.id {
            activeGatewayId = gateways.first?.id
        }
    }

    func delete(at offsets: IndexSet) {
        let toDelete = offsets.map { gateways[$0] }
        for gw in toDelete {
            try? KeychainService.shared.delete(for: gw.id)
        }
        gateways.remove(atOffsets: offsets)
        persist()
        if let activeId = activeGatewayId,
           !gateways.contains(where: { $0.id == activeId }) {
            activeGatewayId = gateways.first?.id
        }
    }

    func setActive(_ gateway: GatewayConnection) {
        activeGatewayId = gateway.id
    }

    // MARK: - Connection Test

    @MainActor
    func testConnection(gateway: GatewayConnection) async {
        connectionStatuses[gateway.id] = .checking

        do {
            _ = try await APIService.shared.healthCheck(gateway: gateway)
            connectionStatuses[gateway.id] = .connected
        } catch let error as OpenClawError {
            connectionStatuses[gateway.id] = .failed(error.localizedDescription)
        } catch {
            connectionStatuses[gateway.id] = .failed(error.localizedDescription)
        }
    }

    func connectionStatus(for gateway: GatewayConnection) -> GatewayConnectionStatus {
        connectionStatuses[gateway.id] ?? .unknown
    }
}
