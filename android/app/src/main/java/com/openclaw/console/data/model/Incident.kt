package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class IncidentSeverity {
    @SerialName("critical") CRITICAL,
    @SerialName("warning") WARNING,
    @SerialName("info") INFO
}

@Serializable
enum class IncidentStatus {
    @SerialName("open") OPEN,
    @SerialName("acknowledged") ACKNOWLEDGED,
    @SerialName("resolved") RESOLVED
}

@Serializable
enum class IncidentAction {
    @SerialName("ask_root_cause") ASK_ROOT_CAUSE,
    @SerialName("propose_fix") PROPOSE_FIX,
    @SerialName("acknowledge") ACKNOWLEDGE
}

@Serializable
data class Incident(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    @SerialName("agent_name") val agentName: String,
    val severity: IncidentSeverity,
    val title: String,
    val description: String,
    val status: IncidentStatus,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    val actions: List<IncidentAction> = emptyList()
)

@Serializable
data class IncidentUpdate(
    val id: String,
    val status: IncidentStatus,
    @SerialName("updated_at") val updatedAt: String
)
