// ViewModels/ApprovalViewModel.swift
// OpenClaw Work Console
// @Observable class managing pending approvals with biometric verification.

import Foundation
import Observation
import Combine

@Observable
final class ApprovalViewModel {

    // MARK: State

    private(set) var pendingApprovals: [ApprovalRequest] = []
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?
    private(set) var isProcessing: Bool = false
    private(set) var lastDecision: ApprovalDecision?

    var hasPendingApprovals: Bool { !pendingApprovals.isEmpty }
    var pendingCount: Int { pendingApprovals.count }

    // MARK: Private

    @ObservationIgnored private var webSocket: any WebSocketEventPublishing
    @ObservationIgnored private let apiService: any ApprovalAPIProviding
    @ObservationIgnored private let biometricService: any BiometricAuthenticating
    @ObservationIgnored private let notificationService: any ApprovalNotificationManaging
    @ObservationIgnored private var cancellables = Set<AnyCancellable>()
    @ObservationIgnored private var expiryTimer: _Concurrency.Task<Void, Never>?

    // MARK: Init

    init(
        webSocket: any WebSocketEventPublishing,
        apiService: any ApprovalAPIProviding = APIService.shared,
        biometricService: any BiometricAuthenticating = BiometricService.shared,
        notificationService: any ApprovalNotificationManaging = NotificationService.shared
    ) {
        self.webSocket = webSocket
        self.apiService = apiService
        self.biometricService = biometricService
        self.notificationService = notificationService
        subscribeToEvents()
        startExpiryMonitor()
    }

    deinit {
        expiryTimer?.cancel()
    }

    // MARK: - Fetch

    @MainActor
    func fetchPendingApprovals() async {
        isLoading = true
        errorMessage = nil
        do {
            pendingApprovals = try await apiService.fetchPendingApprovals()
        } catch {
            errorMessage = (error as? OpenClawError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Approve / Deny

    @MainActor
    func approve(approval: ApprovalRequest) async throws {
        guard !approval.isExpired else {
            throw OpenClawError.serverError(code: 1003, message: "Approval has expired")
        }

        // Require biometric verification
        let biometricSuccess = try await biometricService.authenticate(
            reason: "Approve: \(approval.title)"
        )
        guard biometricSuccess else {
            throw BiometricError.authFailed("Biometric not verified")
        }

        isProcessing = true
        defer { isProcessing = false }

        let response = ApprovalResponse(
            approvalId: approval.id,
            decision: .approved,
            biometricVerified: true,
            respondedAt: Date()
        )

        try await apiService.submitApprovalResponse(response)
        remove(approvalId: approval.id)
        lastDecision = .approved
        notificationService.removeDelivered(approvalId: approval.id)

        // Update badge
        await notificationService.updateBadge(count: pendingApprovals.count)
    }

    @MainActor
    func deny(approval: ApprovalRequest) async throws {
        isProcessing = true
        defer { isProcessing = false }

        let response = ApprovalResponse(
            approvalId: approval.id,
            decision: .denied,
            biometricVerified: false,
            respondedAt: Date()
        )

        try await apiService.submitApprovalResponse(response)
        remove(approvalId: approval.id)
        lastDecision = .denied
        notificationService.removeDelivered(approvalId: approval.id)

        await notificationService.updateBadge(count: pendingApprovals.count)
    }

    // MARK: - Helpers

    private func remove(approvalId: String) {
        pendingApprovals.removeAll { $0.id == approvalId }
    }

    // MARK: - Expiry Monitor

    private func startExpiryMonitor() {
        expiryTimer = _Concurrency.Task { [weak self] in
            while !_Concurrency.Task.isCancelled {
                try? await _Concurrency.Task.sleep(nanoseconds: 10_000_000_000) // 10s
                guard !_Concurrency.Task.isCancelled else { break }
                await self?.purgeExpired()
            }
        }
    }

    @MainActor
    func purgeExpired() {
        pendingApprovals.removeAll { $0.isExpired }
    }

    // MARK: - WebSocket

    private func subscribeToEvents() {
        webSocket.eventPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleEvent(event)
            }
            .store(in: &cancellables)
    }

    private func handleEvent(_ event: InboundEvent) {
        switch event {
        case .approvalRequest(let request):
            if !pendingApprovals.contains(where: { $0.id == request.id }) {
                pendingApprovals.append(request)
                let pendingCount = pendingApprovals.count
                let notifications = notificationService
                _Concurrency.Task {
                    await notifications.scheduleApprovalNotification(for: request)
                    await notifications.updateBadge(count: pendingCount)
                }
            }
        default:
            break
        }
    }
}
