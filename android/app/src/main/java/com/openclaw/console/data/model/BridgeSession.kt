package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
enum class BridgeSessionType {
    @SerialName("codex") CODEX,
    @SerialName("terminal") TERMINAL,
    @SerialName("other") OTHER
}

@Serializable
data class BridgeSession(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val type: BridgeSessionType,
    val title: String,
    val cwd: String,
    val closed: Boolean,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    val metadata: JsonObject? = null
)

@Serializable
data class BridgeSessionUpdate(
    val id: String,
    val closed: Boolean,
    @SerialName("updated_at") val updatedAt: String
)
