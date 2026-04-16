package com.openclaw.console.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.openclaw.console.data.model.ApprovalDecision
import com.openclaw.console.data.model.ApprovalResponse
import com.openclaw.console.data.network.ApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * BroadcastReceiver that handles APPROVE/DENY actions directly from notification buttons.
 *
 * Biometric verification is NOT possible from a BroadcastReceiver (no UI context),
 * so [biometricVerified] is set to false. The server should accept this for
 * notification quick-actions but may log it as a reduced-security approval path.
 */
class NotificationActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_APPROVE = "com.openclaw.console.ACTION_APPROVE"
        const val ACTION_DENY = "com.openclaw.console.ACTION_DENY"
        const val EXTRA_APPROVAL_ID = "extra_approval_id"
        const val EXTRA_AGENT_NAME = "extra_agent_name"

        /**
         * Set by the app when a gateway connection is established.
         * The receiver uses this to send HTTP approval responses.
         */
        @Volatile
        var activeApiService: ApiService? = null
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        val approvalId = intent.getStringExtra(EXTRA_APPROVAL_ID) ?: return
        val agentName = intent.getStringExtra(EXTRA_AGENT_NAME)

        val decision = when (intent.action) {
            ACTION_APPROVE -> ApprovalDecision.APPROVED
            ACTION_DENY -> ApprovalDecision.DENIED
            else -> return
        }

        val pendingResult = goAsync()
        val notificationService = NotificationService.getInstance(context)

        scope.launch {
            try {
                val apiService = activeApiService
                if (apiService == null) {
                    notificationService.showErrorNotification(
                        approvalId = approvalId,
                        decision = decision.name.lowercase()
                    )
                    pendingResult.finish()
                    return@launch
                }

                val response = ApprovalResponse(
                    approvalId = approvalId,
                    decision = decision,
                    biometricVerified = false, // Cannot verify biometric from notification context
                    respondedAt = Instant.now().toString()
                )

                val result = apiService.respondToApproval(approvalId, response)

                // Cancel the original approval notification
                notificationService.cancelApprovalNotification(approvalId)

                if (result.isSuccess) {
                    notificationService.showConfirmationNotification(
                        approvalId = approvalId,
                        decision = decision.name.lowercase(),
                        agentName = agentName
                    )
                } else {
                    notificationService.showErrorNotification(
                        approvalId = approvalId,
                        decision = decision.name.lowercase()
                    )
                }
            } catch (e: Exception) {
                notificationService.showErrorNotification(
                    approvalId = approvalId,
                    decision = decision.name.lowercase()
                )
            } finally {
                pendingResult.finish()
            }
        }
    }
}
