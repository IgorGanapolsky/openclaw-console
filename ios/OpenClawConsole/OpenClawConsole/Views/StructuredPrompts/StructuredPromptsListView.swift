//
//  StructuredPromptsListView.swift
//  OpenClaw Work Console
//
//  HIGH-ROI: Simplified structured prompting for Multica integration
//  Drives Daily Active Approvers (DAA) metric
//

import SwiftUI

struct StructuredPromptsListView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @EnvironmentObject private var webSocket: WebSocketService

    @State private var showingCreatePrompt = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingError = false

    var body: some View {
        List {
            // Header section
            Section {
                VStack(spacing: 12) {
                    HStack {
                        Image(systemName: "doc.text.below.ecg")
                            .font(.largeTitle)
                            .foregroundStyle(.blue)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Structured Prompts")
                                .font(.title2)
                                .fontWeight(.semibold)

                            Text("Create issue-based workflows with Multica agents")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()
                    }

                    Button {
                        showingCreatePrompt = true
                    } label: {
                        HStack {
                            Image(systemName: "plus")
                            Text("Create New Prompt")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .padding(.vertical, 8)
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            // Features section
            Section("What You Can Do") {
                FeatureRow(
                    icon: "bubble.left.and.bubble.right",
                    title: "Structured Conversations",
                    subtitle: "Create detailed prompts with context and requirements"
                )

                FeatureRow(
                    icon: "person.crop.circle.badge.clock",
                    title: "Agent Assignment",
                    subtitle: "Assign tasks to specific Multica agents"
                )

                FeatureRow(
                    icon: "calendar.badge.clock",
                    title: "Scheduled Execution",
                    subtitle: "Set up recurring automated workflows"
                )

                FeatureRow(
                    icon: "hand.raised.app",
                    title: "Approval Gates",
                    subtitle: "Require biometric approval for dangerous actions"
                )

                FeatureRow(
                    icon: "chart.bar.doc.horizontal",
                    title: "Progress Tracking",
                    subtitle: "Monitor execution with real-time updates"
                )
            }

            // Quick actions section
            Section("Quick Actions") {
                QuickActionRow(
                    icon: "play.fill",
                    title: "Run CI Pipeline",
                    subtitle: "Deploy latest changes",
                    color: .green
                ) {
                    createQuickPrompt(
                        title: "Run CI Pipeline",
                        prompt: "Deploy the latest changes from the main branch to staging environment. Validate all tests pass before proceeding to production.",
                        agentType: "deploy"
                    )
                }

                QuickActionRow(
                    icon: "chart.line.uptrend.xyaxis",
                    title: "Trading Analysis",
                    subtitle: "Analyze market trends",
                    color: .blue
                ) {
                    createQuickPrompt(
                        title: "Market Analysis",
                        prompt: "Analyze current market trends for BTC, ETH, and major tech stocks. Provide risk assessment and trading recommendations.",
                        agentType: "trading"
                    )
                }

                QuickActionRow(
                    icon: "doc.text.magnifyingglass",
                    title: "Code Review",
                    subtitle: "Review open PRs",
                    color: .orange
                ) {
                    createQuickPrompt(
                        title: "Code Review",
                        prompt: "Review all open pull requests for security vulnerabilities, code quality, and compliance with team standards.",
                        agentType: "github"
                    )
                }
            }

            // Status section
            if let gateway = gatewayManager.activeGateway {
                Section("Integration Status") {
                    HStack {
                        Circle()
                            .fill(.green)
                            .frame(width: 8, height: 8)

                        Text("Connected to OpenClaw Gateway")
                            .font(.caption)

                        Spacer()

                        Text(gateway.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Circle()
                            .fill(.blue)
                            .frame(width: 8, height: 8)

                        Text("Multica Integration Active")
                            .font(.caption)

                        Spacer()

                        Text("Ready")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Prompts")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            // Refresh integration status
        }
        .sheet(isPresented: $showingCreatePrompt) {
            CreatePromptSheet()
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK") { }
        } message: {
            Text(errorMessage ?? "An unknown error occurred")
        }
    }

    // MARK: - Actions

    private func createQuickPrompt(title: String, prompt: String, agentType: String) {
        // For MVP, show the create prompt sheet with prefilled data
        // In future, could directly create the prompt
        showingCreatePrompt = true
    }
}

// MARK: - Supporting Views

struct FeatureRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.blue)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}

struct QuickActionRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(color)
                    .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NavigationStack {
        StructuredPromptsListView()
            .environment(GatewayManager())
            .environmentObject(WebSocketService())
    }
}