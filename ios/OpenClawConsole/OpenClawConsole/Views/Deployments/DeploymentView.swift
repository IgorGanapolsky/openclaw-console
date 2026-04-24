// Views/Deployments/DeploymentView.swift
// OpenClaw Work Console
// Main deployment dashboard showing deployment history and trigger capability

import SwiftUI

struct DeploymentView: View {
    @Bindable var viewModel: DeploymentListViewModel
    @State private var showingTriggerSheet = false

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.deployments.isEmpty {
                ProgressView("Loading deployments…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.filteredDeployments.isEmpty {
                emptyState
            } else {
                list
            }
        }
        .task {
            if viewModel.deployments.isEmpty {
                await viewModel.fetchDeployments()
            }
        }
        .refreshable {
            await viewModel.fetchDeployments()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingTriggerSheet = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Trigger deployment")
            }
            ToolbarItem(placement: .secondaryAction) {
                filterMenu
            }
        }
        .sheet(isPresented: $showingTriggerSheet) {
            DeploymentTriggerView(viewModel: viewModel)
        }
        .navigationTitle("Deployments")
    }

    // MARK: - List

    private var list: some View {
        List(viewModel.filteredDeployments) { deployment in
            NavigationLink(value: deployment) {
                DeploymentRow(deployment: deployment)
            }
            .frame(minHeight: 60)
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Deployment.self) { deployment in
            DeploymentDetailView(deployment: deployment, viewModel: viewModel)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                viewModel.statusFilter == nil ? "No Deployments" : "No \(viewModel.statusFilter!.displayName) Deployments",
                systemImage: "app.badge.checkmark"
            )
        } description: {
            if let error = viewModel.errorMessage {
                Text(error)
            } else {
                Text("No deployments found. Trigger your first deployment to get started.")
            }
        } actions: {
            Button("Trigger Deployment") {
                showingTriggerSheet = true
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Filter Menu

    private var filterMenu: some View {
        Menu {
            Button {
                viewModel.statusFilter = nil
            } label: {
                Label("All Deployments", systemImage: viewModel.statusFilter == nil ? "checkmark" : "list.bullet")
            }
            Divider()
            ForEach(DeploymentStatus.allCases, id: \.self) { status in
                Button {
                    viewModel.statusFilter = (viewModel.statusFilter == status) ? nil : status
                } label: {
                    Label(status.displayName, systemImage: viewModel.statusFilter == status ? "checkmark" : "")
                }
            }
            Divider()
            Button {
                viewModel.environmentFilter = viewModel.environmentFilter == nil ? .staging : nil
            } label: {
                Label("Staging Only", systemImage: viewModel.environmentFilter == .staging ? "checkmark" : "testtube.2")
            }
            Button {
                viewModel.environmentFilter = viewModel.environmentFilter == nil ? .production : nil
            } label: {
                Label("Production Only", systemImage: viewModel.environmentFilter == .production ? "checkmark" : "globe")
            }
        } label: {
            Image(systemName: (viewModel.statusFilter != nil || viewModel.environmentFilter != nil)
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Filter deployments")
    }
}

#Preview {
    NavigationStack {
        DeploymentView(viewModel: DeploymentListViewModel.preview)
    }
}