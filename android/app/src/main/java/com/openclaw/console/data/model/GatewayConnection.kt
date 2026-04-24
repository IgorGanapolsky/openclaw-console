package com.openclaw.console.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import java.util.UUID

@Serializable
data class GatewayConnection(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val baseUrl: String,
    val token: String = "",   // stored separately in EncryptedSharedPreferences; may be blank in this object
    val lastConnectedAt: String? = null,
    val isActive: Boolean = false
)

@Serializable
enum class ResponseProfile {
    @SerialName("codex") CODEX,
    @SerialName("claude-code") CLAUDE_CODE,
    @SerialName("verbose") VERBOSE,
    @SerialName("debug") DEBUG
}

@Serializable
enum class ResponseVerbosity {
    @SerialName("terse") TERSE,
    @SerialName("normal") NORMAL,
    @SerialName("detailed") DETAILED
}

@Serializable
data class LocalModelStatus(
    val enabled: Boolean,
    @SerialName("base_url") val baseUrl: String? = null,
    val model: String? = null
)

@Serializable
data class RuntimeConfig(
    @SerialName("approval_policy_preset") val approvalPolicyPreset: String,
    @SerialName("heartbeat_interval_ms") val heartbeatIntervalMs: Int,
    @SerialName("response_profile") val responseProfile: ResponseProfile,
    @SerialName("response_verbosity") val responseVerbosity: ResponseVerbosity,
    @SerialName("require_biometric") val requireBiometric: Boolean,
    @SerialName("local_model") val localModel: LocalModelStatus
)

@Serializable
data class RuntimeConfigUpdateRequest(
    @SerialName("response_profile") val responseProfile: ResponseProfile? = null,
    @SerialName("response_verbosity") val responseVerbosity: ResponseVerbosity? = null
)
