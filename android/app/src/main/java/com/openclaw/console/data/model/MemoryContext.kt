package com.openclaw.console.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Serializable
data class MemoryContext(
    val memories: List<MemoryItem>,
    @SerialName("prevention_rules")
    val preventionRules: List<String>,
    @SerialName("recent_summary")
    val recentSummary: String
)

@Serializable
data class MemoryItem(
    val context: String,
    val outcome: String, // "positive" or "negative"
    val tags: List<String>,
    val timestamp: String,
    val confidence: Int
)

@Serializable
data class MemoryStats(
    @SerialName("total_memories")
    val totalMemories: Int,
    @SerialName("positive_memories")
    val positiveMemories: Int,
    @SerialName("negative_memories")
    val negativeMemories: Int,
    @SerialName("recent_trend")
    val recentTrend: String
)

@Serializable
data class FeedbackRequest(
    val signal: String, // "up" or "down"
    val context: String,
    @SerialName("agent_id")
    val agentId: String? = null,
    @SerialName("task_id")
    val taskId: String? = null,
    @SerialName("incident_id")
    val incidentId: String? = null,
    val tags: List<String>? = null,
    @SerialName("what_went_wrong")
    val whatWentWrong: String? = null,
    @SerialName("what_worked")
    val whatWorked: String? = null
)

@Serializable
data class FeedbackResponse(
    val accepted: Boolean,
    val reason: String? = null,
    @SerialName("memory_id")
    val memoryId: String? = null
)