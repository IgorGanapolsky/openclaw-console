// Services/NotificationActionHandler.swift
// OpenClaw Work Console
// Handles UNNotificationResponse for approve/deny actions from notification banners.
// Sends approval response via APIService (HTTP fallback since WebSocket may not be active).
// Biometric verification is NOT possible from notification context -- marked accordingly.

import Foundation
import UserNotifications

// MARK: - NotificationActionHandler

final class NotificationActionHandler: NSObject, UNUserNotificationCenterDelegate {

    static let shared = NotificationActionHandler()
    private override init() { super.init() }

    /// Called when the user taps a notification action (Approve / Deny / View)
    /// or taps the notification body itself.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let actionIdentifier = response.actionIdentifier

        switch actionIdentifier {
        case NotificationAction.approve.rawValue:
            handleApprovalAction(decision: .approved, userInfo: userInfo, completionHandler: completionHandler)

        case NotificationAction.deny.rawValue:
            handleApprovalAction(decision: .denied, userInfo: userInfo, completionHandler: completionHandler)

        case NotificationAction.view.rawValue,
             UNNotificationDefaultActionIdentifier:
            // User tapped the notification body or "View" -- the app opens via foreground.
            completionHandler()

        case UNNotificationDismissActionIdentifier:
            completionHandler()

        default:
            completionHandler()
        }
    }

    /// Called when a notification arrives while the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show banner + sound even when app is active, so the user doesn't miss approvals.
        completionHandler([.banner, .sound, .badge])
    }

    // MARK: - Approval Action Handling

    private func handleApprovalAction(
        decision: ApprovalDecision,
        userInfo: [AnyHashable: Any],
        completionHandler: @escaping () -> Void
    ) {
        guard let approvalId = userInfo["approval_id"] as? String else {
            completionHandler()
            return
        }

        // Biometric verification cannot happen from a notification action (no UI context).
        // Mark biometricVerified as false. The server should accept this for notification
        // quick-actions but may log it as a reduced-security approval path.
        let response = ApprovalResponse(
            approvalId: approvalId,
            decision: decision,
            biometricVerified: false,
            respondedAt: Date()
        )

        _Concurrency.Task {
            do {
                try await APIService.shared.submitApprovalResponse(response)

                // Remove the original notification and show confirmation
                NotificationService.shared.removeDelivered(approvalId: approvalId)
                await showConfirmationNotification(
                    approvalId: approvalId,
                    decision: decision,
                    agentName: userInfo["agent_name"] as? String
                )
            } catch {
                await showErrorNotification(
                    approvalId: approvalId,
                    decision: decision,
                    error: error
                )
            }
            completionHandler()
        }
    }

    // MARK: - Confirmation Notifications

    private func showConfirmationNotification(
        approvalId: String,
        decision: ApprovalDecision,
        agentName: String?
    ) async {
        let content = UNMutableNotificationContent()
        content.title = decision == .approved ? "Approved" : "Denied"
        content.body = agentName.map { "Action for \($0) was \(decision.rawValue)." }
            ?? "Approval \(approvalId) was \(decision.rawValue)."
        content.sound = nil // Quiet confirmation
        content.threadIdentifier = "approvals"

        let request = UNNotificationRequest(
            identifier: "approval-confirm-\(approvalId)",
            content: content,
            trigger: nil
        )

        try? await UNUserNotificationCenter.current().add(request)

        // Auto-remove after 5 seconds
        _Concurrency.Task {
            try? await _Concurrency.Task.sleep(nanoseconds: 5_000_000_000)
            UNUserNotificationCenter.current().removeDeliveredNotifications(
                withIdentifiers: ["approval-confirm-\(approvalId)"]
            )
        }
    }

    private func showErrorNotification(
        approvalId: String,
        decision: ApprovalDecision,
        error: Error
    ) async {
        let content = UNMutableNotificationContent()
        content.title = "Action Failed"
        content.body = "Could not \(decision.rawValue) approval. Open app to retry."
        content.sound = .default
        content.threadIdentifier = "approvals"
        content.userInfo = [
            "approval_id": approvalId,
            "type": "approval_error"
        ]

        let request = UNNotificationRequest(
            identifier: "approval-error-\(approvalId)",
            content: content,
            trigger: nil
        )

        try? await UNUserNotificationCenter.current().add(request)
    }
}
