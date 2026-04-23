//
//  CreatePromptView.swift
//  OpenClaw Work Console
//
//  HIGH-ROI: Structured prompting UI for Multica integration
//  Drives Daily Active Approvers (DAA) metric through issue-based workflows
//

import SwiftUI

struct CreatePromptView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(GatewayManager.self) private var gatewayManager
    @EnvironmentObject private var webSocket: WebSocketService

    // Form state
    @State private var title: String = ""
    @State private var prompt: String = ""
    @State private var selectedAgent: Agent?
    @State private var priority: PromptPriority = .medium
    @State private var tags: [String] = []
    @State private var newTag: String = ""
    @State private var isScheduled: Bool = false
    @State private var scheduleTime: Date = Date().addingTimeInterval(3600) // 1 hour from now
    @State private var scheduleFrequency: ScheduleFrequency = .once

    // State management
    @State private var isSubmitting: Bool = false
    @State private var showingError: Bool = false
    @State private var errorMessage: String = ""
    @State private var agents: [Agent] = []
    @State private var showingSuccess: Bool = false

    var body: some View {
        NavigationView {
            Form {
                Section("Prompt Details") {
                    TextField("Title", text: $title, prompt: Text("What should this prompt accomplish?"))
                        .textInputAutocapitalization(.words)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Prompt")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        TextEditor(text: $prompt)
                            .frame(minHeight: 100)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(.quaternary, lineWidth: 1)
                            )

                        if prompt.isEmpty {
                            Text("Describe the task in detail. Be specific about expected outputs and any constraints.")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }

                Section("Agent & Priority") {
                    Picker("Agent", selection: $selectedAgent) {
                        Text("Select Agent")
                            .tag(Agent?.none)

                        ForEach(agents, id: \.id) { agent in
                            HStack {
                                StatusDot(status: agent.status)
                                Text(agent.name)
                            }
                            .tag(Agent?.some(agent))
                        }
                    }
                    .pickerStyle(.menu)

                    Picker("Priority", selection: $priority) {
                        ForEach(PromptPriority.allCases, id: \.self) { priority in
                            HStack {
                                Circle()
                                    .fill(priority.color)
                                    .frame(width: 8, height: 8)
                                Text(priority.displayName)
                            }
                            .tag(priority)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Tags") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: 8) {
                        ForEach(tags, id: \.self) { tag in
                            TagView(tag: tag) {
                                tags.removeAll { $0 == tag }
                            }
                        }
                    }

                    HStack {
                        TextField("Add tag", text: $newTag)
                            .textInputAutocapitalization(.never)
                            .onSubmit(addTag)

                        Button("Add", action: addTag)
                            .disabled(newTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                Section("Scheduling") {
                    Toggle("Schedule for later", isOn: $isScheduled)

                    if isScheduled {
                        DatePicker("Execute at", selection: $scheduleTime, displayedComponents: [.date, .hourAndMinute])

                        Picker("Frequency", selection: $scheduleFrequency) {
                            ForEach(ScheduleFrequency.allCases, id: \.self) { freq in
                                Text(freq.displayName).tag(freq)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }
            }
            .navigationTitle("New Structured Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            await submitPrompt()
                        }
                    }
                    .disabled(!isFormValid || isSubmitting)
                    .font(.headline)
                }
            }
            .disabled(isSubmitting)
            .overlay {
                if isSubmitting {
                    ProgressView("Creating prompt...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.ultraThinMaterial)
                }
            }
        }
        .onAppear {
            fetchAgents()
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
        .alert("Success", isPresented: $showingSuccess) {
            Button("OK") {
                dismiss()
            }
        } message: {
            Text("Structured prompt created successfully!")
        }
    }

    // MARK: - Computed Properties

    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        selectedAgent != nil
    }

    // MARK: - Actions

    private func addTag() {
        let trimmed = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !tags.contains(trimmed) else { return }

        tags.append(trimmed)
        newTag = ""
    }

    private func fetchAgents() {
        // In a real implementation, this would fetch from the API
        // For now, use sample data or fetch from WebSocket service
        agents = webSocket.agents
    }

    private func submitPrompt() async {
        guard let agent = selectedAgent,
              let gateway = gatewayManager.activeGateway,
              let token = KeychainService.shared.retrieve(for: gateway.id) else {
            showError("Missing required information")
            return
        }

        isSubmitting = true

        do {
            let promptRequest = StructuredPromptRequest(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
                agent_id: agent.id,
                priority: priority.rawValue,
                tags: tags,
                schedule: isScheduled ? createScheduleString() : nil
            )

            let response = try await APIService.shared.createStructuredPrompt(
                gateway: gateway,
                token: token,
                request: promptRequest
            )

            if response.ok {
                showingSuccess = true
            } else {
                showError("Failed to create prompt")
            }
        } catch {
            showError(error.localizedDescription)
        }

        isSubmitting = false
    }

    private func createScheduleString() -> String? {
        guard isScheduled else { return nil }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        formatter.timeZone = TimeZone.current

        let timeString = formatter.string(from: scheduleTime)

        switch scheduleFrequency {
        case .once:
            return "at \(timeString)"
        case .daily:
            return "daily at \(formatter.string(from: scheduleTime))"
        case .weekly:
            return "weekly on \(scheduleTime.formatted(.dateTime.weekday(.wide))) at \(scheduleTime.formatted(.dateTime.hour().minute()))"
        case .monthly:
            return "monthly on day \(Calendar.current.component(.day, from: scheduleTime)) at \(scheduleTime.formatted(.dateTime.hour().minute()))"
        }
    }

    private func showError(_ message: String) {
        errorMessage = message
        showingError = true
    }
}

// MARK: - Supporting Types

enum PromptPriority: String, CaseIterable {
    case low = "Low"
    case medium = "Medium"
    case high = "High"
    case critical = "Critical"

    var displayName: String { rawValue }

    var color: Color {
        switch self {
        case .low: return .green
        case .medium: return .blue
        case .high: return .orange
        case .critical: return .red
        }
    }
}

enum ScheduleFrequency: String, CaseIterable {
    case once = "once"
    case daily = "daily"
    case weekly = "weekly"
    case monthly = "monthly"

    var displayName: String {
        switch self {
        case .once: return "Once"
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        case .monthly: return "Monthly"
        }
    }
}

struct StructuredPromptRequest: Codable {
    let title: String
    let prompt: String
    let agent_id: String
    let priority: String
    let tags: [String]
    let schedule: String?
}

struct TagView: View {
    let tag: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(tag)
                .font(.caption)
                .foregroundStyle(.primary)

            Button(action: onRemove) {
                Image(systemName: "xmark")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.quaternary, in: Capsule())
    }
}

#Preview {
    CreatePromptView()
        .environment(GatewayManager())
        .environmentObject(WebSocketService())
}