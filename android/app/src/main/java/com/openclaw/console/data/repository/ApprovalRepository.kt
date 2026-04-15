package com.openclaw.console.data.repository

import com.openclaw.console.data.model.ApprovalDecision
import com.openclaw.console.data.model.ApprovalRequest
import com.openclaw.console.data.model.ApprovalResponse
import com.openclaw.console.data.model.WebSocketEvent
import com.openclaw.console.data.network.ApiService
import com.openclaw.console.data.network.WebSocketClient
import com.openclaw.console.service.NotificationService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.Instant

open class ApprovalRepository(
    private val apiService: ApiService,
    private val wsClient: WebSocketClient,
    private val notificationService: NotificationService
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _pendingApprovals = MutableStateFlow<List<ApprovalRequest>>(emptyList())
    open val pendingApprovals: StateFlow<List<ApprovalRequest>> = _pendingApprovals

    private val _isLoading = MutableStateFlow(false)
    open val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    open val error: StateFlow<String?> = _error

    init {
        observeWebSocket()
        pruneExpiredApprovals()
    }

    private fun observeWebSocket() {
        scope.launch {
            wsClient.events.collect { event ->
                when (event) {
                    is WebSocketEvent.ApprovalRequest -> {
                        val existing = _pendingApprovals.value
                        if (existing.none { it.id == event.request.id }) {
                            _pendingApprovals.value = listOf(event.request) + existing
                            // Trigger notification for new approval request (matches iOS behavior)
                            notificationService.scheduleApprovalNotification(event.request)
                        }
                    }
                    else -> {}
                }
            }
        }
    }

    private fun pruneExpiredApprovals() {
        scope.launch {
            while (true) {
                val now = Instant.now()
                _pendingApprovals.value = _pendingApprovals.value.filter { approval ->
                    try {
                        Instant.parse(approval.expiresAt).isAfter(now)
                    } catch (e: Exception) {
                        true // keep if we can't parse
                    }
                }
                kotlinx.coroutines.delay(10_000)
            }
        }
    }

    open suspend fun refreshPendingApprovals() {
        _isLoading.value = true
        _error.value = null
        apiService.getPendingApprovals()
            .onSuccess { approvals ->
                _pendingApprovals.value = approvals
            }
            .onFailure { e ->
                _error.value = e.message ?: "Failed to load approvals"
            }
        _isLoading.value = false
    }

    open suspend fun respondToApproval(
        approvalId: String,
        decision: ApprovalDecision,
        biometricVerified: Boolean
    ): Result<Unit> {
        val response = ApprovalResponse(
            approvalId = approvalId,
            decision = decision,
            biometricVerified = biometricVerified,
            respondedAt = Instant.now().toString()
        )

        // Send via WebSocket for real-time handling
        wsClient.sendApprovalResponse(approvalId, decision, biometricVerified)

        // Also persist via HTTP
        val result = apiService.respondToApproval(approvalId, response)

        // Remove from pending list regardless of HTTP result (optimistic)
        _pendingApprovals.value = _pendingApprovals.value.filter { it.id != approvalId }

        // Remove delivered notification (matches iOS behavior)
        notificationService.removeDeliveredApproval(approvalId)

        return result
    }

    open fun getApproval(approvalId: String): ApprovalRequest? {
        return _pendingApprovals.value.find { it.id == approvalId }
    }

    open fun clearError() { _error.value = null }
}
