package com.openclaw.console.data.model

import kotlinx.serialization.Serializable
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
