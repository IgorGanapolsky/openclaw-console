// Views/MainTabView.swift
// OpenClaw Work Console
// Root TabView: Agents | Incidents | Settings
// Badge on Incidents tab shows open incident count.

import SwiftUI

struct MainTabView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @Environment(WebSocketService.self) private var webSocket
    @Environment(ApprovalViewModel.self) private var approvalViewModel

    @State private var selectedTab: Tab = .agents
    @State private var agentListVM: AgentListViewModel?
    @State private var incidentListVM: IncidentListViewModel?
    @State private var bridgeListVM: BridgeListViewModel?

    enum Tab: Int {
        case agents, incidents, bridges, settings
    }

    var body: some View {
        ZStack(alignment: .top) {
            TabView(selection: $selectedTab) {
                // MARK: Agents Tab
                NavigationStack {
                    if let vm = agentListVM {
                        AgentListView(viewModel: vm)
                    } else {
                        ProgressView()
                    }
                }
                .tabItem {
                    Label("Agents", systemImage: "square.grid.2x2")
                }
                .tag(Tab.agents)

                // MARK: Incidents Tab
                NavigationStack {
                    if let vm = incidentListVM {
                        IncidentListView(viewModel: vm)
                    } else {
                        ProgressView()
                    }
                }
                .tabItem {
                    Label("Incidents", systemImage: "exclamationmark.triangle")
                }
                .badge(incidentListVM?.openCount ?? 0)
                .tag(Tab.incidents)

                // MARK: Bridges Tab
                NavigationStack {
                    if let vm = bridgeListVM {
                        BridgeListView(viewModel: vm)
                    } else {
                        ProgressView()
                    }
                }
                .tabItem {
                    Label("Bridges", systemImage: "app.connected.to.app.below.fill")
                }
                .tag(Tab.bridges)

                // MARK: Settings Tab
                NavigationStack {
                    GatewayListView()
                }
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(Tab.settings)
            }

            // Approval banner overlays all tabs
            if approvalViewModel.hasPendingApprovals {
                ApprovalBannerView()
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }
        }
        .onAppear {
            setupViewModels()
        }
        .onChange(of: gatewayManager.activeGateway) { _, newGateway in
            if newGateway != nil {
                setupViewModels()
            }
        }
    }

    // MARK: - Setup

    private func setupViewModels() {
        guard let gateway = gatewayManager.activeGateway,
              let token = KeychainService.shared.retrieve(for: gateway.id) else { return }

        let agentVM = AgentListViewModel(webSocket: webSocket)
        let incidentVM = IncidentListViewModel(webSocket: webSocket)
        let bridgeVM = BridgeListViewModel(webSocket: webSocket)

        agentListVM = agentVM
        incidentListVM = incidentVM
        bridgeListVM = bridgeVM

        // Connect WebSocket
        webSocket.connect(baseURL: gateway.baseURL, token: token)

        // Fetch initial data
        _Concurrency.Task {
            await agentVM.fetchAgents()
            await incidentVM.fetchIncidents()
            await bridgeVM.fetchBridges()
            await approvalViewModel.fetchPendingApprovals()
        }
    }
}
