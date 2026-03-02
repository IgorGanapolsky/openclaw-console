package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class AgentStatus {
    @SerialName("online") ONLINE,
    @SerialName("offline") OFFLINE,
    @SerialName("busy") BUSY
}

@Serializable
data class Agent(
    val id: String,
    val name: String,
    val description: String,
    val status: AgentStatus,
    val workspace: String,
    val tags: List<String> = emptyList(),
    @SerialName("last_active") val lastActive: String,
    @SerialName("active_tasks") val activeTasks: Int = 0,
    @SerialName("pending_approvals") val pendingApprovals: Int = 0
)

// Used for WebSocket agent_update partial payloads when only status fields change
@Serializable
data class AgentStatusUpdate(
    val id: String,
    val status: AgentStatus,
    @SerialName("active_tasks") val activeTasks: Int = 0,
    @SerialName("pending_approvals") val pendingApprovals: Int = 0,
    @SerialName("last_active") val lastActive: String? = null
)
