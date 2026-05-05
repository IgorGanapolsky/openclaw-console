// Views/Settings/GatewayListView.swift
// OpenClaw Work Console
// List of saved gateways with status, swipe-to-delete, test connection.

import SwiftUI

struct GatewayListView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @State private var showAddGateway = false
    @State private var editingGateway: GatewayConnection?

    var body: some View {
        List {
            if gatewayManager.gateways.isEmpty {
                emptyState
            } else {
                ForEach(gatewayManager.gateways) { gateway in
                    GatewayRow(gateway: gateway, onEdit: { editingGateway = gateway })
                }
                .onDelete { offsets in
                    gatewayManager.delete(at: offsets)
                }
            }

            if let activeGateway = gatewayManager.activeGateway {
                Section("Operator Response") {
                    OperatorResponseSettingsView(gateway: activeGateway)
                }
            }

            Section("Subscription") {
                NavigationLink {
                    SubscriptionView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("OpenClaw Pro")
                            Text("Unlock advanced analytics, integrations, webhooks, and unlimited agents.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "star.fill")
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
        .navigationTitle("Gateways")
        .task(id: gatewayManager.activeGatewayId) {
            if let gateway = gatewayManager.activeGateway {
                await gatewayManager.refreshRuntimeConfig(for: gateway)
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: { showAddGateway = true }) {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add Gateway")
            }
        }
        .sheet(isPresented: $showAddGateway) {
            NavigationStack {
                AddGatewayView()
            }
        }
        .sheet(item: $editingGateway) { gateway in
            NavigationStack {
                AddGatewayView(existingGateway: gateway)
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Gateways", systemImage: "network.slash")
        } description: {
            Text("Add a gateway to connect to your OpenClaw instance.")
        } actions: {
            Button("Add Gateway") { showAddGateway = true }
                .buttonStyle(.borderedProminent)
        }
    }
}

private struct OperatorResponseSettingsView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    let gateway: GatewayConnection

    var body: some View {
        if let config = gatewayManager.runtimeConfig(for: gateway) {
            Picker("Style", selection: bindingForProfile(current: config.responseProfile)) {
                ForEach(ResponseProfile.allCases, id: \.self) { profile in
                    Text(profile.displayName).tag(profile)
                }
            }

            Picker("Verbosity", selection: bindingForVerbosity(current: config.responseVerbosity)) {
                ForEach(ResponseVerbosity.allCases, id: \.self) { verbosity in
                    Text(verbosity.displayName).tag(verbosity)
                }
            }

            Text("Quiet, operator-first summaries stay visible. Raw task activity remains available in task detail.")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            Text("Testing or reconnecting to load runtime settings.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func bindingForProfile(current: ResponseProfile) -> Binding<ResponseProfile> {
        Binding(
            get: { gatewayManager.runtimeConfig(for: gateway)?.responseProfile ?? current },
            set: { newValue in
                _Concurrency.Task {
                    await gatewayManager.updateRuntimeConfig(for: gateway, responseProfile: newValue)
                }
            }
        )
    }

    private func bindingForVerbosity(current: ResponseVerbosity) -> Binding<ResponseVerbosity> {
        Binding(
            get: { gatewayManager.runtimeConfig(for: gateway)?.responseVerbosity ?? current },
            set: { newValue in
                _Concurrency.Task {
                    await gatewayManager.updateRuntimeConfig(for: gateway, responseVerbosity: newValue)
                }
            }
        )
    }
}

// MARK: - GatewayRow

private struct GatewayRow: View {
    @Environment(GatewayManager.self) private var gatewayManager
    let gateway: GatewayConnection
    let onEdit: () -> Void

    private var status: GatewayConnectionStatus {
        gatewayManager.connectionStatus(for: gateway)
    }

    private var isActive: Bool {
        gatewayManager.activeGatewayId == gateway.id
    }

    var body: some View {
        HStack(spacing: 12) {
            ConnectionStatusDot(status: status, size: 10)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(gateway.name)
                        .font(.headline)
                    if isActive {
                        Text("Active")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.blue, in: Capsule())
                    }
                }
                Text(gateway.baseURL)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if !gateway.isSecure {
                    Label("Insecure HTTP", systemImage: "lock.slash")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }

                if let health = gatewayManager.health(for: gateway) {
                    Text(runtimeSummary(health))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            // Status label
            Group {
                switch status {
                case .connected:
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                case .failed:
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                case .checking:
                    ProgressView().scaleEffect(0.7)
                case .unknown:
                    EmptyView()
                }
            }
            .font(.body)
        }
        .contentShape(Rectangle())
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                gatewayManager.delete(gateway: gateway)
            } label: {
                Label("Delete", systemImage: "trash")
            }

            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            .tint(.blue)
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                _Concurrency.Task { await gatewayManager.testConnection(gateway: gateway) }
            } label: {
                Label("Test", systemImage: "antenna.radiowaves.left.and.right")
            }
            .tint(.indigo)
        }
        .contextMenu {
            Button {
                gatewayManager.setActive(gateway)
            } label: {
                Label("Set as Active", systemImage: "checkmark.circle")
            }
            Button {
                _Concurrency.Task { await gatewayManager.testConnection(gateway: gateway) }
            } label: {
                Label("Test Connection", systemImage: "antenna.radiowaves.left.and.right")
            }
            Divider()
            Button(action: onEdit) {
                Label("Edit", systemImage: "pencil")
            }
            Button(role: .destructive) {
                gatewayManager.delete(gateway: gateway)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .frame(minHeight: 44)
    }

    private func runtimeSummary(_ health: HealthResponse) -> String {
        let policy = health.approvalPolicyPreset ?? "manual"
        let clients = health.websocketClients ?? 0
        let checked = health.checkedAt?.formatted(date: .omitted, time: .shortened) ?? "unknown"
        return "Policy: \(policy) • WS clients: \(clients) • Checked: \(checked)"
    }
}
