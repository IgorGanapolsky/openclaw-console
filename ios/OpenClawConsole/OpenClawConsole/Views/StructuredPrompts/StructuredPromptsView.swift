//
//  StructuredPromptsView.swift
//  OpenClaw Work Console
//
//  HIGH-ROI: Kanban-style view for Multica issue management
//  Core feature for Daily Active Approvers (DAA) metric
//

import SwiftUI

struct StructuredPromptsView: View {
    @Environment(GatewayManager.self) private var gatewayManager
    @EnvironmentObject private var webSocket: WebSocketService

    @State private var prompts: [StructuredPrompt] = []
    @State private var isLoading: Bool = true
    @State private var showingCreatePrompt: Bool = false
    @State private var searchText: String = ""
    @State private var selectedPriority: PromptPriority? = nil
    @State private var selectedStatus: PromptStatus? = nil
    @State private var showingFilters: Bool = false

    // Computed filtered prompts
    private var filteredPrompts: [StructuredPrompt] {
        prompts
            .filter { prompt in
                (searchText.isEmpty || prompt.title.localizedCaseInsensitiveContains(searchText) ||
                 prompt.description.localizedCaseInsensitiveContains(searchText))
            }
            .filter { prompt in
                selectedPriority == nil || prompt.priority == selectedPriority
            }
            .filter { prompt in
                selectedStatus == nil || prompt.status == selectedStatus
            }
    }

    // Group prompts by status for Kanban view
    private var promptsByStatus: [PromptStatus: [StructuredPrompt]] {
        Dictionary(grouping: filteredPrompts) { $0.status }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search and filter bar
                VStack(spacing: 12) {
                    SearchBar(text: $searchText)

                    if showingFilters {
                        FilterBar(
                            selectedPriority: $selectedPriority,
                            selectedStatus: $selectedStatus
                        )
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.regularMaterial)

                if isLoading {
                    Spacer()
                    ProgressView("Loading prompts...")
                    Spacer()
                } else if filteredPrompts.isEmpty {
                    EmptyPromptsView(hasPrompts: !prompts.isEmpty) {
                        showingCreatePrompt = true
                    }
                } else {
                    // Kanban Board View
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 16) {
                            ForEach(PromptStatus.allCases, id: \.self) { status in
                                KanbanColumn(
                                    title: status.displayName,
                                    color: status.color,
                                    prompts: promptsByStatus[status] ?? []
                                )
                                .frame(width: 280)
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.vertical)
                }
            }
            .navigationTitle("Structured Prompts")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingCreatePrompt = true
                    } label: {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                    }
                }

                ToolbarItem(placement: .secondaryAction) {
                    Button {
                        withAnimation {
                            showingFilters.toggle()
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .foregroundStyle(showingFilters ? .primary : .secondary)
                    }
                }

                ToolbarItem(placement: .secondaryAction) {
                    Button {
                        Task {
                            await fetchPrompts()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .onAppear {
            Task {
                await fetchPrompts()
            }
        }
        .sheet(isPresented: $showingCreatePrompt) {
            CreatePromptView()
        }
    }

    // MARK: - Actions

    private func fetchPrompts() async {
        guard let gateway = gatewayManager.activeGateway,
              let token = KeychainService.shared.retrieve(for: gateway.id) else {
            return
        }

        isLoading = true

        do {
            prompts = try await APIService.shared.fetchStructuredPrompts(
                gateway: gateway,
                token: token
            )
        } catch {
            print("Failed to fetch prompts: \(error)")
            // TODO: Show error alert
        }

        isLoading = false
    }
}

// MARK: - Supporting Views

struct SearchBar: View {
    @Binding var text: String

    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField("Search prompts...", text: $text)
                .textInputAutocapitalization(.never)

            if !text.isEmpty {
                Button("Clear") {
                    text = ""
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct FilterBar: View {
    @Binding var selectedPriority: PromptPriority?
    @Binding var selectedStatus: PromptStatus?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Text("Filter:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                FilterChip(
                    title: "Priority",
                    selection: $selectedPriority,
                    options: PromptPriority.allCases
                ) { priority in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(priority.color)
                            .frame(width: 6, height: 6)
                        Text(priority.displayName)
                    }
                }

                FilterChip(
                    title: "Status",
                    selection: $selectedStatus,
                    options: PromptStatus.allCases
                ) { status in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(status.color)
                            .frame(width: 6, height: 6)
                        Text(status.displayName)
                    }
                }

                Spacer()

                if selectedPriority != nil || selectedStatus != nil {
                    Button("Clear") {
                        selectedPriority = nil
                        selectedStatus = nil
                    }
                    .font(.caption)
                    .foregroundStyle(.blue)
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

struct FilterChip<T: Hashable, Content: View>: View {
    let title: String
    @Binding var selection: T?
    let options: [T]
    @ViewBuilder let content: (T) -> Content

    @State private var isExpanded: Bool = false

    var body: some View {
        Menu {
            Button("None") {
                selection = nil
            }

            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                } label: {
                    content(option)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(title)
                if let selection = selection {
                    content(selection)
                }
                Image(systemName: "chevron.down")
                    .font(.caption2)
            }
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(selection != nil ? .blue.opacity(0.1) : .quaternary, in: Capsule())
        }
    }
}

struct KanbanColumn: View {
    let title: String
    let color: Color
    let prompts: [StructuredPrompt]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(color)

                Spacer()

                Text("\(prompts.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
            }

            LazyVStack(spacing: 8) {
                ForEach(prompts, id: \.id) { prompt in
                    PromptCard(prompt: prompt)
                }
            }

            if prompts.isEmpty {
                Text("No \(title.lowercased()) prompts")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
                    .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(.quaternary, style: StrokeStyle(lineWidth: 1, dash: [5]))
                    }
            }

            Spacer()
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct PromptCard: View {
    let prompt: StructuredPrompt

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Circle()
                    .fill(prompt.priority.color)
                    .frame(width: 8, height: 8)

                Text(prompt.title)
                    .font(.headline)
                    .lineLimit(2)

                Spacer()

                if prompt.isScheduled {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(prompt.description)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)

            HStack {
                StatusDot(status: prompt.agent.status)

                Text(prompt.agent.name)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(prompt.createdAt.formatted(.relative(presentation: .named)))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !prompt.tags.isEmpty {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: 4) {
                    ForEach(prompt.tags.prefix(4), id: \.self) { tag in
                        Text(tag)
                            .font(.caption2)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(.quaternary, in: Capsule())
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .shadow(radius: 1)
    }
}

struct EmptyPromptsView: View {
    let hasPrompts: Bool
    let onCreate: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.below.ecg")
                .font(.system(size: 60))
                .foregroundStyle(.quaternary)

            VStack(spacing: 8) {
                Text(hasPrompts ? "No matching prompts" : "No Structured Prompts")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text(hasPrompts ?
                     "Try adjusting your search or filter criteria" :
                     "Create your first structured prompt to start automating workflows with Multica agents")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }

            if !hasPrompts {
                Button("Create First Prompt") {
                    onCreate()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Data Models

struct StructuredPrompt: Identifiable, Codable {
    let id: String
    let title: String
    let description: String
    let agent: Agent
    let priority: PromptPriority
    let status: PromptStatus
    let tags: [String]
    let createdAt: Date
    let updatedAt: Date
    let isScheduled: Bool
    let schedule: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, agent, priority, status, tags, schedule
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case isScheduled = "is_scheduled"
    }
}

enum PromptStatus: String, CaseIterable, Codable {
    case todo = "Todo"
    case inProgress = "In Progress"
    case inReview = "In Review"
    case done = "Done"

    var displayName: String { rawValue }

    var color: Color {
        switch self {
        case .todo: return .gray
        case .inProgress: return .blue
        case .inReview: return .orange
        case .done: return .green
        }
    }
}

#Preview {
    StructuredPromptsView()
        .environment(GatewayManager())
        .environmentObject(WebSocketService())
}