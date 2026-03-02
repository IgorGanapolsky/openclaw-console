// Views/Chat/ChatView.swift
// OpenClaw Work Console
// Simple chat view with message bubbles, input bar, and auto-scroll.

import SwiftUI
import Combine

struct ChatView: View {
    let agentId: String
    let taskId: String?

    @Environment(WebSocketService.self) private var webSocket
    @State private var viewModel: ChatViewModel?
    @State private var inputText: String = ""
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        VStack(spacing: 0) {
            if let vm = viewModel {
                messageList(vm: vm)
                    .safeAreaInset(edge: .bottom) {
                        inputBar(vm: vm)
                    }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            let vm = ChatViewModel(agentId: agentId, taskId: taskId, webSocket: webSocket)
            viewModel = vm
        }
    }

    // MARK: - Message List

    private func messageList(vm: ChatViewModel) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    if vm.messages.isEmpty {
                        emptyState
                            .padding(.top, 60)
                    } else {
                        ForEach(vm.messages) { message in
                            ChatBubble(message: message)
                                .padding(.horizontal, 16)
                                .id(message.id)
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .onAppear { scrollProxy = proxy }
            .onChange(of: vm.messages.count) { _, _ in
                scrollToBottom(proxy: proxy, messages: vm.messages)
            }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy, messages: [ChatMessage]) {
        guard let lastId = messages.last?.id else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo(lastId, anchor: .bottom)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Send a message to start a conversation.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Input Bar

    private func inputBar(vm: ChatViewModel) -> some View {
        HStack(spacing: 10) {
            TextField("Message", text: $inputText, axis: .vertical)
                .lineLimit(1...5)
                .textFieldStyle(.roundedBorder)
                .frame(minHeight: 44)

            Button {
                let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                inputText = ""
                Task { await vm.sendMessage(text) }
            } label: {
                if vm.isSending {
                    ProgressView()
                        .frame(width: 32, height: 32)
                } else {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                         ? Color.secondary : .blue)
                }
            }
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSending)
            .frame(width: 44, height: 44)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }
}

// MARK: - ChatBubble (shared between ChatView and TaskDetailView)

struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if message.role.isUser { Spacer(minLength: 44) }

            VStack(alignment: message.role.isUser ? .trailing : .leading, spacing: 3) {
                Text(message.content)
                    .font(.body)
                    .foregroundStyle(message.role.isUser ? .white : .primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(message.role.isUser ? Color.blue : Color(.secondarySystemBackground))
                    )

                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if !message.role.isUser { Spacer(minLength: 44) }
        }
    }
}

// MARK: - ChatViewModel (lightweight, scoped to a single agent/task)

@Observable
final class ChatViewModel {
    private(set) var messages: [ChatMessage] = []
    private(set) var isSending: Bool = false

    private let agentId: String
    private let taskId: String?
    private var webSocket: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    init(agentId: String, taskId: String?, webSocket: WebSocketService) {
        self.agentId = agentId
        self.taskId = taskId
        self.webSocket = webSocket
        subscribeToEvents()
    }

    @MainActor
    func sendMessage(_ text: String) async {
        isSending = true
        let userMsg = ChatMessage(
            id: UUID().uuidString,
            agentId: agentId,
            taskId: taskId,
            role: .user,
            content: text,
            timestamp: Date()
        )
        messages.append(userMsg)

        do {
            let request = ChatMessageRequest(agentId: agentId, message: text, taskId: taskId)
            let response = try await APIService.shared.sendChatMessage(request)
            messages.append(response)
        } catch {
            // Keep user message in history; show error inline
            let errorMsg = ChatMessage(
                id: UUID().uuidString,
                agentId: agentId,
                taskId: taskId,
                role: .agent,
                content: "⚠ Failed to deliver: \(error.localizedDescription)",
                timestamp: Date()
            )
            messages.append(errorMsg)
        }
        isSending = false
    }

    private func subscribeToEvents() {
        webSocket.eventPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if case .chatResponse(let msg) = event,
                   msg.agentId == agentId,
                   msg.taskId == taskId {
                    if !messages.contains(where: { $0.id == msg.id }) {
                        messages.append(msg)
                    }
                }
            }
            .store(in: &cancellables)
    }
}

#Preview {
    NavigationStack {
        ChatView(agentId: "a1", taskId: nil)
            .environment(WebSocketService())
    }
}
