package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class TaskStatus {
    @SerialName("queued") QUEUED,
    @SerialName("running") RUNNING,
    @SerialName("done") DONE,
    @SerialName("failed") FAILED
}

@Serializable
enum class TaskStepType {
    @SerialName("log") LOG,
    @SerialName("tool_call") TOOL_CALL,
    @SerialName("output") OUTPUT,
    @SerialName("error") ERROR,
    @SerialName("info") INFO
}

@Serializable
enum class ResourceLinkType {
    @SerialName("github_pr") GITHUB_PR,
    @SerialName("github_run") GITHUB_RUN,
    @SerialName("dashboard") DASHBOARD,
    @SerialName("external") EXTERNAL
}

@Serializable
data class ResourceLink(
    val label: String,
    val url: String,
    val type: ResourceLinkType
)

@Serializable
data class TaskStep(
    val id: String,
    @SerialName("task_id") val taskId: String,
    val type: TaskStepType,
    val content: String,
    val timestamp: String,
    val metadata: kotlinx.serialization.json.JsonObject? = null
)

@Serializable
data class Task(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val title: String,
    val description: String,
    val status: TaskStatus,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    val steps: List<TaskStep> = emptyList(),
    val links: List<ResourceLink> = emptyList()
)

@Serializable
data class TaskUpdate(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val status: TaskStatus,
    @SerialName("updated_at") val updatedAt: String
)
