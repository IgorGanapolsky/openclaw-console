// Views/Loops/LoopListView.swift
// OpenClaw Work Console

import SwiftUI

struct LoopListView: View {
    @State var viewModel: LoopListViewModel
    @State private var showingGenerator = false

    var body: some View {
        List {
            if viewModel.tasks.isEmpty && !viewModel.isLoading {
                ContentUnavailableView("No Active Loops", 
                                     systemImage: "arrow.triangle.2.circlepath", 
                                     description: Text("Generate a new autonomous skill to get started."))
            } else {
                ForEach(viewModel.tasks) { task in
                    LoopRow(task: task)
                }
            }
        }
        .navigationTitle("Autonomous Loops")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingGenerator = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
            }
        }
        .refreshable {
            await viewModel.fetchLoops()
        }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .alert("Error", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: { _ in viewModel.errorMessage = nil }
        )) {
            Button("OK") { }
        } message: {
            if let msg = viewModel.errorMessage {
                Text(msg)
            }
        }
        .sheet(isPresented: $showingGenerator) {
            SkillGeneratorView(viewModel: viewModel)
        }
    }
}

struct LoopRow: View {
    let task: RecurringTask

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(task.name, systemImage: "arrow.triangle.2.circlepath")
                    .font(.headline)
                
                Spacer()
                
                Text(task.status.uppercased())
                    .font(.caption2.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(statusColor.opacity(0.2))
                    .foregroundStyle(statusColor)
                    .clipShape(Capsule())
            }
            
            Text(task.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            
            HStack {
                Text("Agent: \(task.agentId)")
                Spacer()
                if let next = task.nextRun {
                    Text("Next: \(formatDate(next))")
                }
            }
            .font(.caption)
            .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
    
    private var statusColor: Color {
        switch task.status {
        case "active": return .green
        case "paused": return .orange
        case "failed": return .red
        default: return .secondary
        }
    }
    
    private func formatDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = formatter.date(from: iso) {
            return d.formatted(date: .omitted, time: .shortened)
        }
        return iso
    }
}

struct SkillGeneratorView: View {
    @Environment(\.dismiss) var dismiss
    @Bindable var viewModel: LoopListViewModel
    @State private var prompt: String = ""
    
    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("Prompt")) {
                    TextEditor(text: $prompt)
                        .frame(height: 100)
                    Text("Describe the autonomous loop you want to create (e.g. 'Check AWS spend every hour').")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                if let err = viewModel.generateError {
                    Section {
                        Text(err).foregroundStyle(.red)
                    }
                }
                if let msg = viewModel.generateSuccessMsg {
                    Section {
                        Text(msg).foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("New Skill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Generate") {
                        Task {
                            await viewModel.generateSkill(prompt: prompt)
                        }
                    }
                    .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isGenerating)
                }
            }
            .overlay {
                if viewModel.isGenerating {
                    ProgressView("Generating skill code...")
                        .padding()
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }
}
