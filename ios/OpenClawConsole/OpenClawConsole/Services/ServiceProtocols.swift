// Services/ServiceProtocols.swift
// OpenClaw Work Console
// Narrow interfaces used by view models so critical flows can be unit tested
// without replacing global singletons or subclassing concrete final services.

import Combine
import Foundation

protocol WebSocketEventPublishing: AnyObject {
    var eventPublisher: AnyPublisher<InboundEvent, Never> { get }
}

protocol ApprovalAPIProviding: AnyObject {
    func fetchPendingApprovals() async throws -> [ApprovalRequest]
    func submitApprovalResponse(_ response: ApprovalResponse) async throws
}

protocol GitAPIProviding: AnyObject {
    func fetchGitFileChanges(agentId: String) async throws -> [GitFileChange]
    func fetchGitCommitHistory(agentId: String, limit: Int) async throws -> [GitCommit]
    func refreshGitStatus(agentId: String) async throws
}

protocol BiometricAuthenticating: AnyObject {
    func authenticate(reason: String) async throws -> Bool
}

protocol ApprovalNotificationManaging: AnyObject {
    func scheduleApprovalNotification(for approval: ApprovalRequest) async
    func removeDelivered(approvalId: String)
    func updateBadge(count: Int) async
}
