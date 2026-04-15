// Views/Tasks/TaskDetailView.swift
// OpenClaw Work Console
// Task detail: title, status, timeline of steps, resource links, inline chat.

import SwiftUI

struct TaskDetailView: View {
    let agentId: String
    let taskId: String
    @EnvironmentObject private var webSocket: WebSocketService

    @State private var viewModel: TaskDetailViewModel?
    @State private var chatInput: String = ""

    var body: some View {
        Group {
            if let vm = viewModel {
                content(vm: vm)
            } else {
                ProgressView("Loading task…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let vm = TaskDetailViewModel(agentId: agentId, taskId: taskId, webSocket: webSocket)
            viewModel = vm
            await vm.fetchTask()
        }
    }

    // MARK: - Main Content

    @ViewBuilder
    private func content(vm: TaskDetailViewModel) -> some View {
        if let task = vm.task {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    taskHeader(task: task)

                    if !task.links.isEmpty {
                        ResourceLinksRow(links: task.links)
                            .padding(.bottom, 8)
                    }

                    Divider()
                        .padding(.vertical, 8)

                    if task.steps.isEmpty {
                        Text("No steps yet.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 16)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(task.steps) { step in
                                TaskStepRow(step: step)
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    Divider()
                        .padding(.top, 16)

                    // Inline chat
                    taskChatSection(vm: vm)
                }
            }
            .navigationTitle(task.title)
            .safeAreaInset(edge: .bottom) {
                chatInputBar(vm: vm)
            }
        } else if let error = vm.errorMessage {
            ContentUnavailableView {
                Label("Failed to Load", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Retry") { _Concurrency.Task { await vm.fetchTask() } }
                    .buttonStyle(.bordered)
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Task Header

    private func taskHeader(task: OCTask) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TaskStatusBadge(status: task.status)
                Spacer()
                TimeAgoText(date: task.updatedAt)
            }

            Text(task.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Chat Section

    private func taskChatSection(vm: TaskDetailViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !vm.chatMessages.isEmpty {
                Text("Conversation")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 8)

                ForEach(vm.chatMessages) { message in
                    ChatBubble(message: message)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                }
                .padding(.bottom, 80)
            }
        }
    }

    // MARK: - Chat Input Bar

    private func chatInputBar(vm: TaskDetailViewModel) -> some View {
        HStack(spacing: 12) {
            TextField("Ask about this task…", text: $chatInput, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.roundedBorder)
                .frame(minHeight: 44)

            Button {
                let text = chatInput
                chatInput = ""
                _Concurrency.Task { await vm.sendMessage(text) }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(chatInput.isEmpty ? .secondary : .blue)
            }
            .disabled(chatInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || vm.isSendingMessage)
            .frame(minWidth: 44, minHeight: 44)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }
}

// MARK: - TaskStepRow (vertical timeline)

private struct TaskStepRow: View {
    let step: TaskStep

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline line + dot
            VStack(spacing: 0) {
                Circle()
                    .fill(stepColor)
                    .frame(width: 10, height: 10)
                    .padding(.top, 4)
                Rectangle()
                    .fill(Color(.systemGray4))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
            }
            .frame(width: 20)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: step.type.systemImage)
                        .font(.caption)
                        .foregroundStyle(stepColor)
                    Text(step.type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(stepColor)
                    Spacer()
                    Text(step.timestamp, style: .time)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Text(step.content)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            .padding(.bottom, 16)
        }
    }

    private var stepColor: Color {
        switch step.type {
        case .log: return .secondary
        case .toolCall: return .blue
        case .output: return .green
        case .error: return .red
        case .info: return .indigo
        }
    }
}
