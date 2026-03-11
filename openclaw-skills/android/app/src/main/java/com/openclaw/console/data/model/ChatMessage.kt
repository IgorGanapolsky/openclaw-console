package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class MessageRole {
    @SerialName("user") USER,
    @SerialName("agent") AGENT
}

@Serializable
data class ChatMessage(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    @SerialName("task_id") val taskId: String? = null,
    val role: MessageRole,
    val content: String,
    val timestamp: String
)
