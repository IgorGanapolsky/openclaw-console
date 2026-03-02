// Views/Tasks/TaskListView.swift
// OpenClaw Work Console
// List of tasks for an agent with status badges and navigation.

import SwiftUI

struct TaskListView: View {
    @Bindable var viewModel: TaskListViewModel

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.tasks.isEmpty {
                ProgressView("Loading tasks…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.filteredTasks.isEmpty {
                emptyState
            } else {
                list
            }
        }
        .task {
            if viewModel.tasks.isEmpty {
                await viewModel.fetchTasks()
            }
        }
        .refreshable {
            await viewModel.fetchTasks()
        }
        .toolbar {
            ToolbarItem(placement: .secondaryAction) {
                filterMenu
            }
        }
    }

    // MARK: - List

    private var list: some View {
        List(viewModel.filteredTasks) { task in
            NavigationLink(value: task) {
                TaskRow(task: task)
            }
            .frame(minHeight: 44)
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Task.self) { task in
            TaskDetailView(agentId: task.agentId, taskId: task.id)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                viewModel.statusFilter == nil ? "No Tasks" : "No \(viewModel.statusFilter!.displayName) Tasks",
                systemImage: "checklist"
            )
        } description: {
            if let error = viewModel.errorMessage {
                Text(error)
            } else {
                Text("No tasks match the current filter.")
            }
        }
    }

    // MARK: - Filter Menu

    private var filterMenu: some View {
        Menu {
            Button {
                viewModel.statusFilter = nil
            } label: {
                Label("All Tasks", systemImage: viewModel.statusFilter == nil ? "checkmark" : "list.bullet")
            }
            Divider()
            ForEach(TaskStatus.allCases, id: \.self) { status in
                Button {
                    viewModel.statusFilter = (viewModel.statusFilter == status) ? nil : status
                } label: {
                    Label(status.displayName, systemImage: viewModel.statusFilter == status ? "checkmark" : "")
                }
            }
        } label: {
            Image(systemName: viewModel.statusFilter == nil
                  ? "line.3.horizontal.decrease.circle"
                  : "line.3.horizontal.decrease.circle.fill")
        }
        .accessibilityLabel("Filter tasks")
    }
}

// MARK: - TaskRow

struct TaskRow: View {
    let task: Task

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 4)
                .fill(taskStatusColor(task.status))
                .frame(width: 4)
                .frame(height: 44)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(task.title)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    TaskStatusBadge(status: task.status)
                }
                TimeAgoText(date: task.updatedAt)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - TaskStatusBadge

struct TaskStatusBadge: View {
    let status: TaskStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(taskStatusColor(status))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(taskStatusColor(status).opacity(0.12), in: Capsule())
    }
}

// MARK: - Color helper (free function for reuse)

func taskStatusColor(_ status: TaskStatus) -> Color {
    switch status {
    case .queued: return .blue
    case .running: return .orange
    case .done: return .green
    case .failed: return .red
    }
}

#Preview {
    NavigationStack {
        TaskListView(viewModel: TaskListViewModel(agentId: "a1", webSocket: WebSocketService()))
            .environment(WebSocketService())
    }
}
