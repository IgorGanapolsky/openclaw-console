// Tests/ApprovalViewModelTests.swift
// OpenClaw Work Console
// Critical path tests for approval flow - the core of Daily Active Approvers metric.

import XCTest
import Combine
@testable import OpenClawConsole

final class ApprovalViewModelTests: XCTestCase {

    var viewModel: ApprovalViewModel!
    var mockWebSocketService: MockWebSocketService!
    var mockAPIService: MockAPIService!
    var mockBiometricService: MockBiometricService!
    var mockNotificationService: MockNotificationService!
    var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        mockWebSocketService = MockWebSocketService()
        mockAPIService = MockAPIService()
        mockBiometricService = MockBiometricService()
        mockNotificationService = MockNotificationService()
        viewModel = ApprovalViewModel(webSocket: mockWebSocketService)
        cancellables = Set<AnyCancellable>()

        // Override global services for testing
        APIService.shared = mockAPIService
        BiometricService.shared = mockBiometricService
        NotificationService.shared = mockNotificationService
    }

    override func tearDown() {
        cancellables = nil
        viewModel = nil
        mockWebSocketService = nil
        mockAPIService = nil
        mockBiometricService = nil
        mockNotificationService = nil
        super.tearDown()
    }

    // MARK: - WebSocket Event Handling Tests

    func testReceivesApprovalRequestViaWebSocket() throws {
        // Given: A fresh viewModel with no pending approvals
        XCTAssertEqual(viewModel.pendingApprovals.count, 0)
        XCTAssertFalse(viewModel.hasPendingApprovals)

        // When: WebSocket receives an approval request
        let approval = createMockApproval()
        mockWebSocketService.simulateEvent(.approvalRequest(approval))

        // Then: Approval appears in pending list
        XCTAssertEqual(viewModel.pendingApprovals.count, 1)
        XCTAssertTrue(viewModel.hasPendingApprovals)
        XCTAssertEqual(viewModel.pendingApprovals.first?.id, approval.id)
        XCTAssertEqual(viewModel.pendingCount, 1)

        // And: Notification was scheduled
        XCTAssertEqual(mockNotificationService.scheduledApprovals.count, 1)
        XCTAssertEqual(mockNotificationService.scheduledApprovals.first?.id, approval.id)
    }

    func testIgnoresDuplicateApprovalRequests() throws {
        // Given: An approval already in the pending list
        let approval = createMockApproval()
        mockWebSocketService.simulateEvent(.approvalRequest(approval))
        XCTAssertEqual(viewModel.pendingApprovals.count, 1)

        // When: Same approval is received again
        mockWebSocketService.simulateEvent(.approvalRequest(approval))

        // Then: No duplicate is added
        XCTAssertEqual(viewModel.pendingApprovals.count, 1)
        XCTAssertEqual(mockNotificationService.scheduledApprovals.count, 1)
    }

    // MARK: - Approval Flow Tests

    func testSuccessfulApprovalWithBiometric() async throws {
        // Given: A pending approval and biometric succeeds
        let approval = createMockApproval()
        mockWebSocketService.simulateEvent(.approvalRequest(approval))
        mockBiometricService.shouldSucceed = true
        mockAPIService.shouldSucceed = true

        XCTAssertFalse(viewModel.isProcessing)
        XCTAssertNil(viewModel.lastDecision)

        // When: User approves
        try await viewModel.approve(approval: approval)

        // Then: Approval is processed successfully
        XCTAssertFalse(viewModel.isProcessing)
        XCTAssertEqual(viewModel.lastDecision, .approved)
        XCTAssertEqual(viewModel.pendingApprovals.count, 0)
        XCTAssertFalse(viewModel.hasPendingApprovals)

        // And: API was called with correct parameters
        XCTAssertEqual(mockAPIService.lastApprovalResponse?.decision, .approved)
        XCTAssertEqual(mockAPIService.lastApprovalResponse?.biometricVerified, true)

        // And: Notification was removed
        XCTAssertEqual(mockNotificationService.removedApprovalIds.count, 1)
        XCTAssertEqual(mockNotificationService.removedApprovalIds.first, approval.id)

        // And: Badge count was updated
        XCTAssertEqual(mockNotificationService.lastBadgeCount, 0)
    }

    func testApprovalFailsWhenBiometricFails() async throws {
        // Given: A pending approval but biometric fails
        let approval = createMockApproval()
        mockWebSocketService.simulateEvent(.approvalRequest(approval))
        mockBiometricService.shouldSucceed = false

        // When: User attempts to approve
        do {
            try await viewModel.approve(approval: approval)
            XCTFail("Should have thrown biometric error")
        } catch {
            // Then: Biometric error is thrown
            XCTAssertTrue(error is BiometricError)

            // And: Approval remains in pending list
            XCTAssertEqual(viewModel.pendingApprovals.count, 1)
            XCTAssertNil(viewModel.lastDecision)

            // And: API was not called
            XCTAssertNil(mockAPIService.lastApprovalResponse)
        }
    }

    func testApprovalFailsWhenExpired() async throws {
        // Given: An expired approval
        let approval = createMockApproval(expired: true)
        mockWebSocketService.simulateEvent(.approvalRequest(approval))

        // When: User attempts to approve
        do {
            try await viewModel.approve(approval: approval)
            XCTFail("Should have thrown expiry error")
        } catch let error as OpenClawError {
            // Then: Expiry error is thrown
            XCTAssertEqual(error.code, 1003)

            // And: Approval processing didn't proceed
            XCTAssertNil(mockAPIService.lastApprovalResponse)
        }
    }

    func testDenyDoesNotRequireBiometric() async throws {
        // Given: A pending approval
        let approval = createMockApproval()
        mockWebSocketService.simulateEvent(.approvalRequest(approval))
        mockAPIService.shouldSucceed = true

        // When: User denies (no biometric prompt should occur)
        try await viewModel.deny(approval: approval)

        // Then: Denial is processed successfully
        XCTAssertEqual(viewModel.lastDecision, .denied)
        XCTAssertEqual(viewModel.pendingApprovals.count, 0)

        // And: API was called with correct parameters
        XCTAssertEqual(mockAPIService.lastApprovalResponse?.decision, .denied)
        XCTAssertEqual(mockAPIService.lastApprovalResponse?.biometricVerified, false)

        // And: Biometric service was never called
        XCTAssertFalse(mockBiometricService.wasAuthenticated)
    }

    // MARK: - Expiry Management Tests

    func testExpiredApprovalsAreRemoved() async throws {
        // Given: Mix of active and expired approvals
        let activeApproval = createMockApproval(id: "active", expired: false)
        let expiredApproval = createMockApproval(id: "expired", expired: true)

        mockWebSocketService.simulateEvent(.approvalRequest(activeApproval))
        mockWebSocketService.simulateEvent(.approvalRequest(expiredApproval))

        XCTAssertEqual(viewModel.pendingApprovals.count, 2)

        // When: Expiry monitor runs (simulate via manual purge)
        await viewModel.purgeExpired()

        // Then: Only active approval remains
        XCTAssertEqual(viewModel.pendingApprovals.count, 1)
        XCTAssertEqual(viewModel.pendingApprovals.first?.id, "active")
    }

    // MARK: - Error Handling Tests

    func testAPIErrorDuringApproval() async throws {
        // Given: A pending approval but API fails
        let approval = createMockApproval()
        mockWebSocketService.simulateEvent(.approvalRequest(approval))
        mockBiometricService.shouldSucceed = true
        mockAPIService.shouldSucceed = false
        mockAPIService.errorMessage = "Network error"

        // When: User approves
        do {
            try await viewModel.approve(approval: approval)
            XCTFail("Should have thrown API error")
        } catch {
            // Then: Error is propagated
            XCTAssertNotNil(error)

            // But: Approval is still removed optimistically
            XCTAssertEqual(viewModel.pendingApprovals.count, 0)
        }
    }

    // MARK: - Test Helpers

    private func createMockApproval(id: String = "test-approval", expired: Bool = false) -> ApprovalRequest {
        let expiresAt = expired ?
            Date().addingTimeInterval(-3600).ISO8601Format() : // 1 hour ago
            Date().addingTimeInterval(3600).ISO8601Format()    // 1 hour from now

        return ApprovalRequest(
            id: id,
            agentId: "test-agent",
            agentName: "Test Agent",
            actionType: "deploy",
            title: "Deploy to production",
            description: "Deploy version 1.2.3 to production environment",
            command: "kubectl apply -f deployment.yaml",
            context: ApprovalRequest.Context(
                service: "api-server",
                environment: "production",
                repository: "company/api",
                riskLevel: "high"
            ),
            createdAt: Date().ISO8601Format(),
            expiresAt: expiresAt
        )
    }
}

// MARK: - Mock Services

class MockWebSocketService: WebSocketService {
    override init() {
        super.init()
    }

    func simulateEvent(_ event: InboundEvent) {
        eventSubject.send(event)
        lastEvent = event
    }
}

class MockAPIService: APIService {
    var shouldSucceed = true
    var errorMessage = "Mock error"
    var lastApprovalResponse: ApprovalResponse?

    override func submitApprovalResponse(_ response: ApprovalResponse) async throws {
        lastApprovalResponse = response
        if !shouldSucceed {
            throw NSError(domain: "MockAPI", code: 500, userInfo: [NSLocalizedDescriptionKey: errorMessage])
        }
    }

    override func fetchPendingApprovals() async throws -> [ApprovalRequest] {
        if !shouldSucceed {
            throw NSError(domain: "MockAPI", code: 500, userInfo: [NSLocalizedDescriptionKey: errorMessage])
        }
        return []
    }
}

class MockBiometricService: BiometricService {
    var shouldSucceed = true
    var wasAuthenticated = false

    override func authenticate(reason: String) async throws -> Bool {
        wasAuthenticated = true
        if shouldSucceed {
            return true
        } else {
            throw BiometricError.authFailed("Mock biometric failure")
        }
    }
}

class MockNotificationService: NotificationService {
    var scheduledApprovals: [ApprovalRequest] = []
    var removedApprovalIds: [String] = []
    var lastBadgeCount: Int?

    override func scheduleApprovalNotification(for approval: ApprovalRequest) async {
        scheduledApprovals.append(approval)
    }

    override func removeDelivered(approvalId: String) {
        removedApprovalIds.append(approvalId)
    }

    override func updateBadge(count: Int) async {
        lastBadgeCount = count
    }
}
