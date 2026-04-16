package com.openclaw.console.data.model

sealed class WebSocketEvent {
    data class Connected(
        val sessionId: String,
        val gatewayVersion: String,
        val heartbeatIntervalMs: Int,
        val timestamp: String?
    ) : WebSocketEvent()
    data class Heartbeat(
        val gatewayVersion: String,
        val connectedClients: Int,
        val lastInboundAt: String?,
        val lastOutboundAt: String?,
        val uptimeSeconds: Long,
        val timestamp: String?
    ) : WebSocketEvent()
    data class AgentUpdate(val agentStatus: Agent) : WebSocketEvent()
    data class TaskUpdate(val update: com.openclaw.console.data.model.TaskUpdate) : WebSocketEvent()
    data class TaskStepAdded(val step: TaskStep) : WebSocketEvent()
    data class IncidentNew(val incident: Incident) : WebSocketEvent()
    data class IncidentUpdate(val update: com.openclaw.console.data.model.IncidentUpdate) : WebSocketEvent()
    data class ApprovalRequest(val request: com.openclaw.console.data.model.ApprovalRequest) : WebSocketEvent()
    data class ChatResponse(val message: ChatMessage) : WebSocketEvent()
    data class AgentStatusChange(
        val agentId: String,
        val agentName: String,
        val previousStatus: AgentStatus,
        val newStatus: AgentStatus
    ) : WebSocketEvent()
    data class BridgeSessionNew(val session: BridgeSession) : WebSocketEvent()
    data class BridgeSessionUpdate(val session: BridgeSession) : WebSocketEvent()
    data class RecurringTaskUpdated(val task: RecurringTask) : WebSocketEvent()
    data class Error(val code: Int, val message: String) : WebSocketEvent()
    data object Disconnected : WebSocketEvent()
    data class Reconnecting(val attempt: Int, val delayMs: Long) : WebSocketEvent()
}
