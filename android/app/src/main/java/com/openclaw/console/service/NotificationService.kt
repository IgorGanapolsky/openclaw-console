package com.openclaw.console.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.openclaw.console.R
import com.openclaw.console.data.model.ApprovalRequest
import com.openclaw.console.data.model.Incident
import com.openclaw.console.data.model.IncidentSeverity
import com.openclaw.console.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

// Extension function for backward compatibility with older Kotlin versions
private fun String.capitalizeCompat(): String {
    return if (isEmpty()) this else this[0].uppercase() + substring(1)
}

/**
 * Android notification service for OpenClaw Console.
 * Handles approval requests and critical incidents with actionable notifications.
 * Matches iOS NotificationService functionality for cross-platform parity.
 */
class NotificationService private constructor(private val context: Context) {

    companion object {
        private const val CHANNEL_APPROVALS = "approval_requests"
        private const val CHANNEL_INCIDENTS = "critical_incidents"
        private const val CHANNEL_AGENT_STATUS = "agent_status"
        private const val CHANNEL_CONFIRMATIONS = "action_confirmations"
        private const val APPROVAL_NOTIFICATION_ID_BASE = 1000
        private const val INCIDENT_NOTIFICATION_ID_BASE = 2000
        private const val AGENT_STATUS_NOTIFICATION_ID_BASE = 3000
        private const val CONFIRMATION_NOTIFICATION_ID_BASE = 4000

        @Volatile
        private var INSTANCE: NotificationService? = null

        fun getInstance(context: Context): NotificationService {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: NotificationService(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val notificationManager = NotificationManagerCompat.from(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        // Approval requests channel - high priority for immediate attention
        val approvalChannel = NotificationChannel(
            CHANNEL_APPROVALS,
            "Approval Requests",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Agent actions requiring approval with biometric verification"
            enableVibration(true)
            setShowBadge(true)
        }

        // Critical incidents channel - high priority for operational issues
        val incidentChannel = NotificationChannel(
            CHANNEL_INCIDENTS,
            "Critical Incidents",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Critical incidents requiring immediate attention"
            enableVibration(true)
            setShowBadge(true)
        }

        // Agent status channel - default priority for informational updates
        val agentStatusChannel = NotificationChannel(
            CHANNEL_AGENT_STATUS,
            "Agent Status Changes",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Notifications when agents come online, go offline, or become busy"
            setShowBadge(false)
        }

        // Confirmation channel - low priority for action confirmations
        val confirmationChannel = NotificationChannel(
            CHANNEL_CONFIRMATIONS,
            "Action Confirmations",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Confirmations for approval actions taken from notifications"
            setShowBadge(false)
        }

        notificationManager.createNotificationChannels(listOf(approvalChannel, incidentChannel, agentStatusChannel, confirmationChannel))
    }

    /**
     * Schedule approval notification with approve/deny actions.
     * Mirrors iOS scheduleApprovalNotification functionality.
     */
    fun scheduleApprovalNotification(approval: ApprovalRequest) {
        scope.launch {
            val openAppIntent = Intent(context, MainActivity::class.java)
            openAppIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            openAppIntent.putExtra("approval_id", approval.id)
            openAppIntent.putExtra("navigation_target", "approvals")

            val openAppPendingIntent = PendingIntent.getActivity(
                context,
                approval.id.hashCode(),
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(context, CHANNEL_APPROVALS)
                .setSmallIcon(R.drawable.ic_security) // Assumes security icon exists
                .setContentTitle("Approval Required")
                .setContentText("${approval.agentName}: ${approval.title}")
                .setSubText(approval.actionType.name.lowercase().capitalizeCompat())
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(false) // Keep until user responds
                .setContentIntent(openAppPendingIntent)
                .addAction(
                    R.drawable.ic_check,
                    "Approve",
                    createApprovalActionIntent(approval.id, "approve")
                )
                .addAction(
                    R.drawable.ic_close,
                    "Deny",
                    createApprovalActionIntent(approval.id, "deny")
                )
                .setStyle(NotificationCompat.BigTextStyle()
                    .bigText("${approval.description}\n\nRisk: ${approval.context.riskLevel}"))
                .setGroup("approvals")
                .build()

            withContext(Dispatchers.Main) {
                try {
                    notificationManager.notify(
                        APPROVAL_NOTIFICATION_ID_BASE + approval.id.hashCode(),
                        notification
                    )
                } catch (e: SecurityException) {
                    // Notification permission denied - silently fail as per iOS behavior
                }
            }
        }
    }

    /**
     * Schedule critical incident notification.
     * Mirrors iOS scheduleCriticalIncidentNotification functionality.
     */
    fun scheduleCriticalIncidentNotification(incident: Incident) {
        if (incident.severity != IncidentSeverity.CRITICAL) return

        scope.launch {
            val openAppIntent = Intent(context, MainActivity::class.java)
            openAppIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            openAppIntent.putExtra("incident_id", incident.id)
            openAppIntent.putExtra("navigation_target", "incidents")

            val openAppPendingIntent = PendingIntent.getActivity(
                context,
                incident.id.hashCode(),
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(context, CHANNEL_INCIDENTS)
                .setSmallIcon(R.drawable.ic_warning) // Assumes warning icon exists
                .setContentTitle("Critical Incident")
                .setContentText("${incident.agentName}: ${incident.title}")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ERROR)
                .setAutoCancel(true)
                .setContentIntent(openAppPendingIntent)
                .addAction(
                    R.drawable.ic_visibility,
                    "View",
                    openAppPendingIntent
                )
                .setStyle(NotificationCompat.BigTextStyle().bigText(incident.description))
                .setGroup("incidents")
                .build()

            withContext(Dispatchers.Main) {
                try {
                    notificationManager.notify(
                        INCIDENT_NOTIFICATION_ID_BASE + incident.id.hashCode(),
                        notification
                    )
                } catch (e: SecurityException) {
                    // Notification permission denied - silently fail
                }
            }
        }
    }

    /**
     * Remove delivered approval notification.
     * Mirrors iOS removeDelivered functionality.
     */
    fun removeDeliveredApproval(approvalId: String) {
        notificationManager.cancel(APPROVAL_NOTIFICATION_ID_BASE + approvalId.hashCode())
    }

    /**
     * Remove delivered incident notification.
     * Mirrors iOS removeDeliveredIncident functionality.
     */
    fun removeDeliveredIncident(incidentId: String) {
        notificationManager.cancel(INCIDENT_NOTIFICATION_ID_BASE + incidentId.hashCode())
    }

    /**
     * Clear all delivered notifications.
     */
    fun clearAllNotifications() {
        notificationManager.cancelAll()
    }

    /**
     * Show confirmation notification after an approval action from notification.
     */
    fun showConfirmationNotification(approvalId: String, decision: String, agentName: String?) {
        val body = agentName?.let { "Action for $it was $decision." }
            ?: "Approval $approvalId was $decision."

        val notification = NotificationCompat.Builder(context, CHANNEL_CONFIRMATIONS)
            .setSmallIcon(R.drawable.ic_check)
            .setContentTitle(decision.capitalizeCompat())
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setTimeoutAfter(5000) // Auto-dismiss after 5 seconds
            .build()

        try {
            notificationManager.notify(
                CONFIRMATION_NOTIFICATION_ID_BASE + approvalId.hashCode(),
                notification
            )
        } catch (_: SecurityException) { }
    }

    /**
     * Show error notification when an approval action fails.
     */
    fun showErrorNotification(approvalId: String, decision: String) {
        val notification = NotificationCompat.Builder(context, CHANNEL_APPROVALS)
            .setSmallIcon(R.drawable.ic_warning)
            .setContentTitle("Action Failed")
            .setContentText("Could not $decision approval. Open app to retry.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        try {
            notificationManager.notify(
                CONFIRMATION_NOTIFICATION_ID_BASE + "$approvalId-error".hashCode(),
                notification
            )
        } catch (_: SecurityException) { }
    }

    /**
     * Cancel a specific approval notification.
     */
    fun cancelApprovalNotification(approvalId: String) {
        removeDeliveredApproval(approvalId)
    }

    /**
     * Schedule agent status change notification.
     * Matches iOS scheduleAgentStatusChangeNotification.
     */
    fun scheduleAgentStatusChangeNotification(
        agentId: String,
        agentName: String,
        previousStatus: String,
        newStatus: String
    ) {
        scope.launch {
            val notification = NotificationCompat.Builder(context, CHANNEL_AGENT_STATUS)
                .setSmallIcon(R.drawable.ic_visibility)
                .setContentTitle("Agent Status Changed")
                .setContentText("$agentName is now $newStatus (was $previousStatus)")
                .setSubText(agentName)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setGroup("agent_status")
                .build()

            withContext(Dispatchers.Main) {
                try {
                    notificationManager.notify(
                        AGENT_STATUS_NOTIFICATION_ID_BASE + agentId.hashCode(),
                        notification
                    )
                } catch (_: SecurityException) { }
            }
        }
    }

    private fun createApprovalActionIntent(approvalId: String, action: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        intent.putExtra("approval_id", approvalId)
        intent.putExtra("approval_action", action)
        intent.putExtra("navigation_target", "approvals")

        return PendingIntent.getActivity(
            context,
            "$approvalId-$action".hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}