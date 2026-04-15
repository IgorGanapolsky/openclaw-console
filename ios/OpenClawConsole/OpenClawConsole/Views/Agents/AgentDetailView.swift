// Views/Agents/AgentDetailView.swift
// OpenClaw Work Console
// Agent detail: header + segmented picker for Tasks | Chat.

import SwiftUI

struct AgentDetailView: View {
    let agent: Agent
    @EnvironmentObject private var webSocket: WebSocketService

    @State private var selectedSegment: Segment = .tasks
    @State private var taskListVM: TaskListViewModel?
    @State private var chatMessages: [ChatMessage] = []

    enum Segment: String, CaseIterable {
        case tasks = "Tasks"
        case chat = "Chat"
    }

    var body: some View {
        VStack(spacing: 0) {
            // MARK: Agent Header
            agentHeader
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 12)

            Divider()

            // MARK: Segment Picker
            Picker("View", selection: $selectedSegment) {
                ForEach(Segment.allCases, id: \.self) { segment in
                    Text(segment.rawValue).tag(segment)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Divider()

            // MARK: Content
            Group {
                switch selectedSegment {
                case .tasks:
                    if let vm = taskListVM {
                        TaskListView(viewModel: vm)
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                case .chat:
                    ChatView(agentId: agent.id, taskId: nil)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle(agent.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let vm = TaskListViewModel(agentId: agent.id, webSocket: webSocket)
            taskListVM = vm
            await vm.fetchTasks()
        }
    }

    // MARK: - Agent Header

    private var agentHeader: some View {
        HStack(alignment: .top, spacing: 12) {
            StatusDot(status: agent.status, size: 12)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 4) {
                Text(agent.name)
                    .font(.title3.weight(.semibold))

                Text(agent.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Text(agent.status.displayName)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(statusColor)

                    if !agent.workspace.isEmpty {
                        Text(agent.workspace)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()
                    TimeAgoText(date: agent.lastActive)
                }

                // Tags
                if !agent.tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(agent.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color(.secondarySystemBackground), in: Capsule())
                            }
                        }
                    }
                }
            }
        }
    }

    private var statusColor: Color {
        switch agent.status {
        case .online: return .green
        case .busy: return .yellow
        case .offline: return .secondary
        }
    }
}
