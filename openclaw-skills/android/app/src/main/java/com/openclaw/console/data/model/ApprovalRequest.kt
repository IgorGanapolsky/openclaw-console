package com.openclaw.console.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ActionType {
    @SerialName("deploy") DEPLOY,
    @SerialName("shell_command") SHELL_COMMAND,
    @SerialName("config_change") CONFIG_CHANGE,
    @SerialName("key_rotation") KEY_ROTATION,
    @SerialName("trade_execution") TRADE_EXECUTION,
    @SerialName("destructive") DESTRUCTIVE
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
    @SerialName("risk_level") val riskLevel: RiskLevel = RiskLevel.HIGH
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
