// ViewModels/GatewayManager.swift
// OpenClaw Work Console
// @Observable class managing gateway connections.
// Non-sensitive fields persisted to UserDefaults; tokens in Keychain.

import Foundation
import Observation
import Combine

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
    private(set) var gatewayHealth: [String: HealthResponse] = [:]
    private(set) var runtimeConfigs: [String: RuntimeConfigResponse] = [:]

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
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

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
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

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
            let health = try await APIService.shared.healthCheck(gateway: gateway)
            gatewayHealth[gateway.id] = health
            runtimeConfigs[gateway.id] = try await APIService.shared.fetchRuntimeConfig(gateway: gateway)
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

    func health(for gateway: GatewayConnection) -> HealthResponse? {
        gatewayHealth[gateway.id]
    }

    func runtimeConfig(for gateway: GatewayConnection) -> RuntimeConfigResponse? {
        runtimeConfigs[gateway.id]
    }

    @MainActor
    func refreshRuntimeConfig(for gateway: GatewayConnection) async {
        do {
            runtimeConfigs[gateway.id] = try await APIService.shared.fetchRuntimeConfig(gateway: gateway)
        } catch let error as OpenClawError {
            connectionStatuses[gateway.id] = .failed(error.localizedDescription)
        } catch {
            connectionStatuses[gateway.id] = .failed(error.localizedDescription)
        }
    }

    @MainActor
    func updateRuntimeConfig(
        for gateway: GatewayConnection,
        responseProfile: ResponseProfile? = nil,
        responseVerbosity: ResponseVerbosity? = nil
    ) async {
        do {
            runtimeConfigs[gateway.id] = try await APIService.shared.updateRuntimeConfig(
                responseProfile: responseProfile,
                responseVerbosity: responseVerbosity,
                gateway: gateway
            )
            if let health = gatewayHealth[gateway.id] {
                gatewayHealth[gateway.id] = HealthResponse(
                    status: health.status,
                    version: health.version,
                    gatewayVersion: health.gatewayVersion,
                    startedAt: health.startedAt,
                    checkedAt: Date(),
                    uptimeSeconds: health.uptimeSeconds,
                    websocketClients: health.websocketClients,
                    lastInboundWsAt: health.lastInboundWsAt,
                    lastOutboundWsAt: health.lastOutboundWsAt,
                    approvalPolicyPreset: health.approvalPolicyPreset,
                    responseProfile: responseProfile ?? health.responseProfile,
                    responseVerbosity: responseVerbosity ?? health.responseVerbosity,
                    localModel: health.localModel
                )
            }
        } catch let error as OpenClawError {
            connectionStatuses[gateway.id] = .failed(error.localizedDescription)
        } catch {
            connectionStatuses[gateway.id] = .failed(error.localizedDescription)
        }
    }
}
