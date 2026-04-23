package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
enum class ActionType {
    @SerialName("deploy") DEPLOY,
    @SerialName("shell_command") SHELL_COMMAND,
    @SerialName("config_change") CONFIG_CHANGE,
    @SerialName("key_rotation") KEY_ROTATION,
    @SerialName("trade_execution") TRADE_EXECUTION,
    @SerialName("destructive") DESTRUCTIVE,
    @SerialName("ask_root_cause") ASK_ROOT_CAUSE,
    @SerialName("propose_fix") PROPOSE_FIX,
    @SerialName("acknowledge") ACKNOWLEDGE,
    @SerialName("git_commit") GIT_COMMIT,
    @SerialName("git_merge") GIT_MERGE,
    @SerialName("git_push") GIT_PUSH,
    @SerialName("agent_skill_install") AGENT_SKILL_INSTALL,
    @SerialName("agent_rollback") AGENT_ROLLBACK
}

@Serializable
enum class RiskLevel {
    @SerialName("high") HIGH,
    @SerialName("critical") CRITICAL
}

@Serializable
enum class ApprovalDecision {
    @SerialName("approved") APPROVED,
    @SerialName("denied") DENIED
}

@Serializable
data class ApprovalContext(
    val service: String = "",
    val environment: String = "",
    val repository: String = "",
    @SerialName("risk_level") val riskLevel: RiskLevel = RiskLevel.HIGH,
    @SerialName("git_operation") val gitOperation: GitOperation? = null
)

@Serializable
data class GitOperation(
    @SerialName("operation_type") val operationType: String,
    @SerialName("branch_from") val branchFrom: String? = null,
    @SerialName("branch_to") val branchTo: String? = null,
    @SerialName("commit_message") val commitMessage: String? = null,
    @SerialName("file_changes") val fileChanges: List<String>? = null,
    @SerialName("diff_summary") val diffSummary: String? = null
)

@Serializable
data class ApprovalRequest(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    @SerialName("agent_name") val agentName: String,
    @SerialName("action_type") val actionType: ActionType,
    val title: String,
    val description: String,
    val command: String,
    val context: ApprovalContext,
    @SerialName("created_at") val createdAt: String,
    @SerialName("expires_at") val expiresAt: String
)

@Serializable
data class ApprovalResponse(
    @SerialName("approval_id") val approvalId: String,
    val decision: ApprovalDecision,
    @SerialName("biometric_verified") val biometricVerified: Boolean,
    @SerialName("responded_at") val respondedAt: String
)

@Serializable
enum class AgentPlanStepStatus {
    @SerialName("pending") PENDING,
    @SerialName("running") RUNNING,
    @SerialName("done") DONE,
    @SerialName("blocked") BLOCKED,
    @SerialName("skipped") SKIPPED
}

@Serializable
data class AgentPlanStep(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val title: String,
    val details: String,
    val status: AgentPlanStepStatus,
    val owner: String? = null,
    val evidence: List<ResourceLink> = emptyList(),
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String
)

@Serializable
data class EnvironmentObservation(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val source: String,
    val summary: String,
    @SerialName("observed_at") val observedAt: String,
    val metadata: JsonObject? = null
)

@Serializable
data class RollbackPoint(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    @SerialName("action_type") val actionType: ActionType,
    val title: String,
    val description: String,
    val command: String,
    @SerialName("created_at") val createdAt: String,
    val metadata: JsonObject? = null
)

@Serializable
data class GovernanceEvent(
    val id: String,
    @SerialName("agent_id") val agentId: String,
    val type: String,
    val title: String,
    val summary: String,
    @SerialName("created_at") val createdAt: String,
    val actor: String,
    @SerialName("risk_level") val riskLevel: RiskLevel? = null,
    @SerialName("approval_id") val approvalId: String? = null,
    @SerialName("task_id") val taskId: String? = null,
    @SerialName("incident_id") val incidentId: String? = null,
    @SerialName("rollback_point_id") val rollbackPointId: String? = null,
    val metadata: JsonObject? = null
)

@Serializable
data class AgentGovernanceState(
    @SerialName("agent_id") val agentId: String,
    @SerialName("current_objective") val currentObjective: String? = null,
    @SerialName("objective_updated_at") val objectiveUpdatedAt: String? = null,
    val plan: List<AgentPlanStep> = emptyList(),
    val environment: List<EnvironmentObservation> = emptyList(),
    @SerialName("rollback_points") val rollbackPoints: List<RollbackPoint> = emptyList(),
    val events: List<GovernanceEvent> = emptyList()
)
