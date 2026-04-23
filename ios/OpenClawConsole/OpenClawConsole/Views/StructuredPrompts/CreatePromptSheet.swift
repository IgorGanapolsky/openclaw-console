//
//  CreatePromptSheet.swift
//  OpenClaw Work Console
//
//  HIGH-ROI: Simplified prompt creation for Multica integration
//

import SwiftUI

struct CreatePromptSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(GatewayManager.self) private var gatewayManager
    @EnvironmentObject private var webSocket: WebSocketService

    @State private var title: String = ""
    @State private var prompt: String = ""
    @State private var selectedAgentId: String = ""
    @State private var priority: String = "Medium"
    @State private var isSubmitting: Bool = false
    @State private var showingError: Bool = false
    @State private var errorMessage: String = ""
    @State private var showingSuccess: Bool = false

    private let priorities = ["Low", "Medium", "High", "Critical"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Prompt Details") {
                    TextField("Title", text: $title, prompt: Text("What should this accomplish?"))

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Description")
                            .font(.headline)

                        TextEditor(text: $prompt)
                            .frame(minHeight: 100)

                        if prompt.isEmpty {
                            Text("Describe the task in detail. Be specific about outputs and constraints.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Configuration") {
                    Picker("Agent", selection: $selectedAgentId) {
                        Text("Select Agent").tag("")

                        ForEach(webSocket.agents, id: \.id) { agent in
                            HStack {
                                StatusDot(status: agent.status)
                                Text(agent.name)
                            }
                            .tag(agent.id)
                        }
                    }

                    Picker("Priority", selection: $priority) {
                        ForEach(priorities, id: \.self) { priority in
                            Text(priority).tag(priority)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    VStack(spacing: 12) {
                        HStack {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.blue)

                            Text("This will create a structured issue in Multica for the selected agent.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        if !selectedAgentId.isEmpty && priority == "Critical" {
                            HStack {
                                Image(systemName: "hand.raised")
                                    .foregroundStyle(.orange)

                                Text("Critical priority prompts may require biometric approval.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } footer: {
                    Text("Structured prompts enable better tracking and approval workflows through Multica integration.")
                }
            }
            .navigationTitle("New Prompt")
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
            Text("Structured prompt created successfully! Check the Tasks tab to monitor progress.")
        }
    }

    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !selectedAgentId.isEmpty
    }

    private func submitPrompt() async {
        guard let gateway = gatewayManager.activeGateway,
              let token = KeychainService.shared.retrieve(for: gateway.id) else {
            showError("No active gateway connection")
            return
        }

        isSubmitting = true

        do {
            let success = try await createStructuredPrompt(
                gateway: gateway,
                token: token,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
                agentId: selectedAgentId,
                priority: priority
            )

            if success {
                showingSuccess = true
            } else {
                showError("Failed to create structured prompt")
            }
        } catch {
            showError(error.localizedDescription)
        }

        isSubmitting = false
    }

    private func createStructuredPrompt(
        gateway: GatewayConnection,
        token: String,
        title: String,
        prompt: String,
        agentId: String,
        priority: String
    ) async throws -> Bool {
        guard let url = URL(string: "\(gateway.baseURL)/api/multica/issues") else {
            throw OpenClawError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "title": title,
            "prompt": prompt,
            "agent_id": agentId,
            "priority": priority,
            "tags": ["mobile-created", priority.lowercased()]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            return false
        }

        if httpResponse.statusCode == 503 {
            throw OpenClawError.serverError(
                code: 503,
                message: "Multica integration not available. Please check gateway configuration."
            )
        }

        if httpResponse.statusCode == 200 {
            return true
        } else {
            // Try to parse error message
            if let errorData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorData["error"] as? [String: Any],
               let message = error["message"] as? String {
                throw OpenClawError.serverError(code: httpResponse.statusCode, message: message)
            }
            return false
        }
    }

    private func showError(_ message: String) {
        errorMessage = message
        showingError = true
    }
}

#Preview {
    CreatePromptSheet()
        .environment(GatewayManager())
        .environmentObject(WebSocketService())
}