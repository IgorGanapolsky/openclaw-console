// Services/NotificationService.swift
// OpenClaw Work Console
// Local notification scheduling for approval requests and critical incidents.
//
// Info.plist: No special key needed for local notifications.
// The user will be prompted for permission on first use.

import Foundation
import Observation
import UserNotifications

// MARK: - Notification Category Identifiers

enum NotificationCategory: String {
    case approvalRequest = "APPROVAL_REQUEST"
    case criticalIncident = "CRITICAL_INCIDENT"
}

// MARK: - Notification Action Identifiers

enum NotificationAction: String {
    case approve = "APPROVE_ACTION"
    case deny = "DENY_ACTION"
    case view = "VIEW_ACTION"
}

// MARK: - NotificationService

@Observable
final class NotificationService {

    static let shared = NotificationService()
    private let center = UNUserNotificationCenter.current()

    private init() {
        registerCategories()
    }

    // MARK: Permission

    var authorizationStatus: UNAuthorizationStatus = .notDetermined

    func requestAuthorization() async {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            let settings = await center.notificationSettings()
            await MainActor.run {
                authorizationStatus = settings.authorizationStatus
            }
            if granted {
                await registerCategories()
            }
        } catch {
            // Permission denied or error – app continues without notifications
        }
    }

    func refreshAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        await MainActor.run {
            authorizationStatus = settings.authorizationStatus
        }
    }

    // MARK: Register Categories with Actions

    @discardableResult
    private func registerCategories() -> Bool {
        let approveAction = UNNotificationAction(
            identifier: NotificationAction.approve.rawValue,
            title: "Approve",
            options: [.authenticationRequired, .foreground]
        )
        let denyAction = UNNotificationAction(
            identifier: NotificationAction.deny.rawValue,
            title: "Deny",
            options: [.destructive, .authenticationRequired]
        )
        let viewAction = UNNotificationAction(
            identifier: NotificationAction.view.rawValue,
            title: "View",
            options: [.foreground]
        )

        let approvalCategory = UNNotificationCategory(
            identifier: NotificationCategory.approvalRequest.rawValue,
            actions: [approveAction, denyAction, viewAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let incidentCategory = UNNotificationCategory(
            identifier: NotificationCategory.criticalIncident.rawValue,
            actions: [viewAction],
            intentIdentifiers: [],
            options: []
        )

        center.setNotificationCategories([approvalCategory, incidentCategory])
        return true
    }

    // MARK: Schedule Approval Notification

    func scheduleApprovalNotification(for approval: ApprovalRequest) async {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Approval Required"
        content.subtitle = approval.agentName
        content.body = approval.title
        content.sound = .defaultCritical
        content.categoryIdentifier = NotificationCategory.approvalRequest.rawValue
        content.userInfo = [
            "approval_id": approval.id,
            "agent_id": approval.agentId,
            "type": "approval_request"
        ]
        content.threadIdentifier = "approvals"

        // Trigger immediately
        let request = UNNotificationRequest(
            identifier: "approval-\(approval.id)",
            content: content,
            trigger: nil  // Deliver immediately
        )

        try? await center.add(request)
    }

    // MARK: Schedule Critical Incident Notification

    func scheduleCriticalIncidentNotification(for incident: Incident) async {
        guard incident.severity == .critical else { return }

        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Critical Incident"
        content.subtitle = incident.agentName
        content.body = incident.title
        content.sound = .defaultCritical
        content.categoryIdentifier = NotificationCategory.criticalIncident.rawValue
        content.userInfo = [
            "incident_id": incident.id,
            "agent_id": incident.agentId,
            "type": "incident"
        ]
        content.threadIdentifier = "incidents"

        let request = UNNotificationRequest(
            identifier: "incident-\(incident.id)",
            content: content,
            trigger: nil
        )

        try? await center.add(request)
    }

    // MARK: Badge Management

    func updateBadge(count: Int) async {
        do {
            try await center.setBadgeCount(count)
        } catch {
            // Badge update failed - non-critical
        }
    }

    func clearBadge() async {
        await updateBadge(count: 0)
    }

    // MARK: Remove Delivered

    func removeDelivered(approvalId: String) {
        center.removeDeliveredNotifications(withIdentifiers: ["approval-\(approvalId)"])
    }

    func removeDeliveredIncident(incidentId: String) {
        center.removeDeliveredNotifications(withIdentifiers: ["incident-\(incidentId)"])
    }
}
