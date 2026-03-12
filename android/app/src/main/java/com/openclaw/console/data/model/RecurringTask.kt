package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class RecurringTaskSchedule(
    val type: String, // "cron" or "interval"
    val value: JsonElement
)

@Serializable
data class RecurringTask(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val name: String,
    val description: String,
    val schedule: RecurringTaskSchedule,
    @SerialName("last_run") val lastRun: String?,
    @SerialName("next_run") val nextRun: String?,
    val status: String,
    @SerialName("error_count") val errorCount: Int
)
