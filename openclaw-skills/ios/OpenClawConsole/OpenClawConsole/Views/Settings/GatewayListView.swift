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
        }
        .navigationTitle("Gateways")
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
}
