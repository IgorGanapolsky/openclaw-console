// Tests/ApprovalViewModelTests.swift
// OpenClaw Work Console
// Critical path tests for approval flow, the core Daily Active Approver loop.

import Combine
import XCTest
@testable import OpenClawConsole

final class ApprovalViewModelTests: XCTestCase {

    private var viewModel: ApprovalViewModel!
    private var webSocket: MockApprovalWebSocket!
    private var api: MockApprovalAPI!
    private var biometric: MockBiometricAuthenticator!
    private var notifications: MockApprovalNotifications!

    override func setUp() {
        super.setUp()
        webSocket = MockApprovalWebSocket()
        api = MockApprovalAPI()
        biometric = MockBiometricAuthenticator()
        notifications = MockApprovalNotifications()
        viewModel = ApprovalViewModel(
            webSocket: webSocket,
            apiService: api,
            biometricService: biometric,
            notificationService: notifications
        )
    }

    override func tearDown() {
        viewModel = nil
        webSocket = nil
        api = nil
        biometric = nil
        notifications = nil
        super.tearDown()
    }

    func testReceivesApprovalRequestViaWebSocket() async throws {
        let approval = createApproval()

        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()

        XCTAssertEqual(viewModel.pendingApprovals.map(\.id), [approval.id])
        XCTAssertTrue(viewModel.hasPendingApprovals)
        XCTAssertEqual(viewModel.pendingCount, 1)
        XCTAssertEqual(notifications.scheduledApprovals.map(\.id), [approval.id])
        XCTAssertEqual(notifications.lastBadgeCount, 1)
    }

    func testIgnoresDuplicateApprovalRequests() async throws {
        let approval = createApproval()

        webSocket.simulateEvent(.approvalRequest(approval))
        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()

        XCTAssertEqual(viewModel.pendingApprovals.count, 1)
        XCTAssertEqual(notifications.scheduledApprovals.count, 1)
    }

    func testSuccessfulApprovalRequiresBiometricAndSubmitsApprovedDecision() async throws {
        let approval = createApproval()
        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()

        try await viewModel.approve(approval: approval)

        XCTAssertEqual(viewModel.lastDecision, .approved)
        XCTAssertTrue(viewModel.pendingApprovals.isEmpty)
        XCTAssertEqual(api.lastApprovalResponse?.decision, .approved)
        XCTAssertEqual(api.lastApprovalResponse?.biometricVerified, true)
        XCTAssertEqual(biometric.authenticationReasons, ["Approve: \(approval.title)"])
        XCTAssertEqual(notifications.removedApprovalIds, [approval.id])
        XCTAssertEqual(notifications.lastBadgeCount, 0)
    }

    func testApprovalFailsBeforeApiWhenBiometricFails() async throws {
        let approval = createApproval()
        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()
        biometric.errorToThrow = BiometricError.authFailed("Mock biometric failure")

        do {
            try await viewModel.approve(approval: approval)
            XCTFail("Expected biometric failure")
        } catch let error as BiometricError {
            guard case .authFailed = error else {
                return XCTFail("Expected authFailed, got \(error)")
            }
        }

        XCTAssertEqual(viewModel.pendingApprovals.map(\.id), [approval.id])
        XCTAssertNil(viewModel.lastDecision)
        XCTAssertNil(api.lastApprovalResponse)
    }

    func testApprovalFailsWhenExpired() async throws {
        let approval = createApproval(expired: true)
        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()

        do {
            try await viewModel.approve(approval: approval)
            XCTFail("Expected expiry failure")
        } catch let error as OpenClawError {
            guard case .serverError(let code, _) = error else {
                return XCTFail("Expected serverError, got \(error)")
            }
            XCTAssertEqual(code, 1003)
        }

        XCTAssertNil(api.lastApprovalResponse)
        XCTAssertTrue(biometric.authenticationReasons.isEmpty)
    }

    func testDenyDoesNotRequireBiometric() async throws {
        let approval = createApproval()
        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()

        try await viewModel.deny(approval: approval)

        XCTAssertEqual(viewModel.lastDecision, .denied)
        XCTAssertTrue(viewModel.pendingApprovals.isEmpty)
        XCTAssertEqual(api.lastApprovalResponse?.decision, .denied)
        XCTAssertEqual(api.lastApprovalResponse?.biometricVerified, false)
        XCTAssertTrue(biometric.authenticationReasons.isEmpty)
    }

    func testExpiredApprovalsAreRemoved() async throws {
        let activeApproval = createApproval(id: "active")
        let expiredApproval = createApproval(id: "expired", expired: true)

        webSocket.simulateEvent(.approvalRequest(activeApproval))
        webSocket.simulateEvent(.approvalRequest(expiredApproval))
        await settleAsyncWork()

        await viewModel.purgeExpired()

        XCTAssertEqual(viewModel.pendingApprovals.map(\.id), ["active"])
    }

    func testApiErrorDuringApprovalLeavesApprovalPending() async throws {
        let approval = createApproval()
        webSocket.simulateEvent(.approvalRequest(approval))
        await settleAsyncWork()
        api.errorToThrow = NSError(
            domain: "MockApprovalAPI",
            code: 500,
            userInfo: [NSLocalizedDescriptionKey: "Network error"]
        )

        do {
            try await viewModel.approve(approval: approval)
            XCTFail("Expected API failure")
        } catch {
            XCTAssertNotNil(error)
        }

        XCTAssertEqual(viewModel.pendingApprovals.map(\.id), [approval.id])
        XCTAssertNil(viewModel.lastDecision)
    }

    private func createApproval(id: String = "test-approval", expired: Bool = false) -> ApprovalRequest {
        let expiresAt: Date = expired
            ? Date().addingTimeInterval(-3600)
            : Date().addingTimeInterval(3600)

        return ApprovalRequest(
            id: id,
            agentId: "test-agent",
            agentName: "Test Agent",
            actionType: .deploy,
            title: "Deploy to production",
            description: "Deploy version 1.2.3 to production environment",
            command: "kubectl apply -f deployment.yaml",
            context: ApprovalContext(
                service: "api-server",
                environment: "production",
                repository: "company/api",
                riskLevel: .high,
                gitOperation: nil
            ),
            createdAt: Date(),
            expiresAt: expiresAt
        )
    }

    private func settleAsyncWork() async {
        await MainActor.run {}
        try? await Task.sleep(nanoseconds: 50_000_000)
    }
}

private final class MockApprovalWebSocket: WebSocketEventPublishing {
    private let subject = PassthroughSubject<InboundEvent, Never>()

    var eventPublisher: AnyPublisher<InboundEvent, Never> {
        subject.eraseToAnyPublisher()
    }

    func simulateEvent(_ event: InboundEvent) {
        subject.send(event)
    }
}

private final class MockApprovalAPI: ApprovalAPIProviding {
    var pendingApprovals: [ApprovalRequest] = []
    var lastApprovalResponse: ApprovalResponse?
    var errorToThrow: Error?

    func fetchPendingApprovals() async throws -> [ApprovalRequest] {
        if let errorToThrow {
            throw errorToThrow
        }
        return pendingApprovals
    }

    func submitApprovalResponse(_ response: ApprovalResponse) async throws {
        if let errorToThrow {
            throw errorToThrow
        }
        lastApprovalResponse = response
    }
}

private final class MockBiometricAuthenticator: BiometricAuthenticating {
    var authenticationReasons: [String] = []
    var errorToThrow: Error?

    func authenticate(reason: String) async throws -> Bool {
        authenticationReasons.append(reason)
        if let errorToThrow {
            throw errorToThrow
        }
        return true
    }
}

private final class MockApprovalNotifications: ApprovalNotificationManaging {
    var scheduledApprovals: [ApprovalRequest] = []
    var removedApprovalIds: [String] = []
    var lastBadgeCount: Int?

    func scheduleApprovalNotification(for approval: ApprovalRequest) async {
        scheduledApprovals.append(approval)
    }

    func removeDelivered(approvalId: String) {
        removedApprovalIds.append(approvalId)
    }

    func updateBadge(count: Int) async {
        lastBadgeCount = count
    }
}
